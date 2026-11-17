import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { salesSchema } from "@/lib/validation/records";

export const POST = apiHandler({ body: salesSchema }, async ({ db, user, params, body }) => {
  const [r] = await db`insert into public.sales_performance ${db({ ...body, userId: user.id, productId: uuid.parse(params.id), source: "manual" } as never)}
    on conflict (product_id, period_start, period_end, source) do update set sessions = excluded.sessions, add_to_carts = excluded.add_to_carts,
      orders = excluded.orders, units = excluded.units, revenue = excluded.revenue, refund_count = excluded.refund_count,
      refunds_amount = excluded.refunds_amount, ad_spend = excluded.ad_spend
    returning id`;
  return r;
});
