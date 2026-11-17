import "server-only";
import type { Db } from "../db";
import type { SupplierOfferInput } from "../analytics/suppliers";

export async function supplierOffersFor(db: Db, productId: string): Promise<SupplierOfferInput[]> {
  return db<SupplierOfferInput[]>`
    select o.id as offer_id, s.id as supplier_id, s.name as supplier_name, s.platform, coalesce(o.url, s.url) as url,
           s.store_rating, s.store_review_count, s.years_active, s.return_policy,
           o.unit_cost, o.shipping_cost, o.ship_days_min, o.ship_days_max, o.moq, o.variants, o.has_clear_specs,
           o.product_rating, o.product_review_count, o.sample_quality
    from public.supplier_offers o join public.suppliers s on s.id = o.supplier_id
    where o.product_id = ${productId} order by o.created_at`;
}
