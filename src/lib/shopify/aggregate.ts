/** Pure aggregation of Shopify orders into per-product, per-day sales rows (unit-tested). */
export interface OrderNode {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  lineItems: { nodes: Array<{ quantity: number; product: { id: string } | null; originalTotalSet: { shopMoney: { amount: string } } }> };
  refunds: Array<{ createdAt: string; refundLineItems: { nodes: Array<{ quantity: number; lineItem: { product: { id: string } | null }; subtotalSet: { shopMoney: { amount: string } } }> } }>;
}

export interface DayRow {
  shopifyProductId: string;
  day: string; // YYYY-MM-DD (UTC)
  orders: number;
  units: number;
  revenue: number;
  refundCount: number;
  refundsAmount: number;
}

/**
 * Revenue = line-item original totals (before order-level discounts, shipping
 * and tax). Refunds are attributed to the refund date. Cancelled orders are
 * excluded.
 */
export function aggregateOrders(orders: OrderNode[], productIds: Set<string>): DayRow[] {
  const map = new Map<string, DayRow & { orderIds: Set<string>; refundOrderIds: Set<string> }>();
  const row = (pid: string, day: string) => {
    const k = `${pid}|${day}`;
    let r = map.get(k);
    if (!r) {
      r = { shopifyProductId: pid, day, orders: 0, units: 0, revenue: 0, refundCount: 0, refundsAmount: 0, orderIds: new Set(), refundOrderIds: new Set() };
      map.set(k, r);
    }
    return r;
  };
  for (const o of orders) {
    if (o.cancelledAt) continue;
    const day = o.createdAt.slice(0, 10);
    for (const li of o.lineItems.nodes) {
      const pid = li.product?.id;
      if (!pid || !productIds.has(pid)) continue;
      const r = row(pid, day);
      r.orderIds.add(o.id);
      r.units += li.quantity;
      r.revenue += Number(li.originalTotalSet.shopMoney.amount);
    }
    for (const rf of o.refunds ?? []) {
      const rday = rf.createdAt.slice(0, 10);
      for (const rl of rf.refundLineItems.nodes) {
        const pid = rl.lineItem.product?.id;
        if (!pid || !productIds.has(pid)) continue;
        const r = row(pid, rday);
        r.refundOrderIds.add(o.id);
        r.refundsAmount += Number(rl.subtotalSet.shopMoney.amount);
      }
    }
  }
  return [...map.values()].map(({ orderIds, refundOrderIds, ...r }) => ({
    ...r,
    orders: orderIds.size,
    refundCount: refundOrderIds.size,
    revenue: Math.round(r.revenue * 100) / 100,
    refundsAmount: Math.round(r.refundsAmount * 100) / 100,
  }));
}
