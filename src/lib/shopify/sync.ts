import "server-only";
import { withUser } from "../db";
import { getIntegration, getConnection } from "./connection";
import { shopifyGraphql } from "./client";
import { Q } from "./queries";
import { aggregateOrders, type OrderNode } from "./aggregate";

const MAX_PAGES = 20; // 20 × 100 orders per run

/**
 * Imports orders for products linked to Shopify (default last 60 days — the
 * window available without the read_all_orders scope) into sales_performance
 * as daily rows (source = 'shopify'). Idempotent: re-running upserts the same
 * day rows. Sessions are not available from the Admin API.
 */
export async function syncShopifySales(userId: string, days = 60): Promise<{ status: "succeeded" | "skipped"; summary: Record<string, unknown> }> {
  const integ = await getIntegration(userId);
  if (!integ) return { status: "skipped", summary: { reason: "Shopify not connected" } };
  const links = await withUser(userId, (db) => db<{ productId: string; shopifyProductGid: string }[]>`select product_id, shopify_product_gid from public.shopify_product_links`);
  if (links.length === 0) return { status: "skipped", summary: { reason: "No research products are linked to Shopify products yet" } };
  const conn = await getConnection(userId);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const orders: OrderNode[] = [];
  let after: string | null = null;
  let truncated = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const r: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] } } = await shopifyGraphql(conn, Q.orders, { first: 100, after, query: `created_at:>=${since}` });
    orders.push(...r.orders.nodes);
    if (!r.orders.pageInfo.hasNextPage) break;
    after = r.orders.pageInfo.endCursor;
    if (i === MAX_PAGES - 1) truncated = true;
  }
  const byGid = new Map(links.map((l) => [l.shopifyProductGid, l.productId]));
  const rows = aggregateOrders(orders, new Set(byGid.keys()));
  await withUser(userId, async (db) => {
    for (const r of rows) {
      const productId = byGid.get(r.shopifyProductId)!;
      await db`insert into public.sales_performance (user_id, product_id, period_start, period_end, orders, units, revenue, refund_count, refunds_amount, source)
        values (${userId}, ${productId}, ${r.day}, ${r.day}, ${r.orders}, ${r.units}, ${r.revenue}, ${r.refundCount}, ${r.refundsAmount}, 'shopify')
        on conflict (product_id, period_start, period_end, source) do update set orders = excluded.orders, units = excluded.units,
          revenue = excluded.revenue, refund_count = excluded.refund_count, refunds_amount = excluded.refunds_amount`;
    }
    await db`update public.shopify_integrations set last_synced_at = now()`;
  });
  return { status: "succeeded", summary: { ordersScanned: orders.length, productDays: rows.length, linkedProducts: links.length, truncated } };
}
