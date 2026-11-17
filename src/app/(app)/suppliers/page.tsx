import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { assessOffer, type SupplierOfferInput } from "@/lib/analytics/suppliers";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { AddRecordButton } from "@/components/ui/add-record";
import { ActionButton } from "@/components/ui/action";
import { fmtMoney, fmtNum } from "@/lib/utils";

export const metadata = { title: "Supplier Research" };

export default async function SuppliersPage() {
  const user = await requireUser();
  const { suppliers, offers } = await withUser(user.id, async (db) => ({
    suppliers: await db<Array<Record<string, unknown> & { id: string; name: string; platform: string; url: string | null; storeRating: number | null; storeReviewCount: number | null; yearsActive: number | null; location: string; returnPolicy: string; isDemo: boolean; offers: number }>>`
      select s.*, (select count(*)::int from public.supplier_offers o where o.supplier_id = s.id) as offers from public.suppliers s order by s.name`,
    offers: await db<Array<SupplierOfferInput & { productId: string; productName: string }>>`
      select o.id as offer_id, s.id as supplier_id, s.name as supplier_name, s.platform, coalesce(o.url, s.url) as url, s.store_rating, s.store_review_count,
        s.years_active, s.return_policy, o.unit_cost, o.shipping_cost, o.ship_days_min, o.ship_days_max, o.moq, o.variants, o.has_clear_specs,
        o.product_rating, o.product_review_count, o.sample_quality, p.id as product_id, p.name as product_name
      from public.supplier_offers o join public.suppliers s on s.id = o.supplier_id join public.products p on p.id = o.product_id order by p.name`,
  }));
  return (
    <>
      <PageHeader title="Supplier Research" description="Every supplier and offer you have recorded, with deterministic red-flag checks. Compare offers per product on the product's Suppliers tab." actions={<AddRecordButton preset="supplier" endpoint="/api/suppliers" title="New supplier" label="New supplier" size="md" variant="primary" />} />
      {suppliers.length === 0 ? <Empty title="No suppliers yet">Add suppliers from AliExpress, CJ Dropshipping, private agents and others. Nothing is imported automatically — supplier data must come from listings you have checked.</Empty> : (
        <>
          <Card className="mb-6">
            <CardHeader title={`Suppliers (${suppliers.length})`} />
            <Table>
              <thead><tr><Th>Supplier</Th><Th>Platform</Th><Th className="text-right">Store rating</Th><Th className="text-right">Reviews</Th><Th className="text-right">Years</Th><Th>Returns</Th><Th className="text-right">Offers</Th><Th /></tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{s.name}</a> : s.name} {s.isDemo && <DemoBadge />}<div className="text-[11px] text-faint">{s.location}</div></Td>
                    <Td className="text-xs">{s.platform.replace(/_/g, " ")}</Td>
                    <Td className="text-right tabular-nums">{s.storeRating ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{fmtNum(s.storeReviewCount)}</Td>
                    <Td className="text-right tabular-nums">{s.yearsActive ?? "—"}</Td>
                    <Td className="max-w-56 text-xs text-muted">{s.returnPolicy ? s.returnPolicy.slice(0, 80) : <span className="text-warn">not recorded</span>}</Td>
                    <Td className="text-right">{s.offers}</Td>
                    <Td className="whitespace-nowrap">
                      <AddRecordButton preset="supplier" endpoint={`/api/suppliers/${s.id}`} method="PATCH" initial={s} title="Edit supplier" label="Edit" variant="ghost" />
                      <ActionButton size="sm" variant="ghost" endpoint={`/api/suppliers/${s.id}`} method="DELETE" confirm="Delete supplier and all its offers?">×</ActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Supplier reliability report — all offers" description="Reliability starts at 100 and loses points for each warning (12) and critical (30) flag; a sample rated ≥4/5 adds 10." />
            <Table>
              <thead><tr><Th>Product</Th><Th>Supplier</Th><Th className="text-right">Landed cost</Th><Th>Delivery</Th><Th className="text-right">Reliability</Th><Th>Flags</Th></tr></thead>
              <tbody>
                {offers.map((o) => {
                  const peers = offers.filter((x) => x.productId === o.productId && x.offerId !== o.offerId).map((x) => x.unitCost).sort((a, b) => a - b);
                  const med = peers.length ? peers[Math.floor(peers.length / 2)] : null;
                  const a = assessOffer(o, med);
                  return (
                    <tr key={o.offerId}>
                      <Td><Link href={`/products/${o.productId}?tab=suppliers`} className="hover:text-accent">{o.productName}</Link></Td>
                      <Td>{o.supplierName}</Td>
                      <Td className="text-right tabular-nums">{fmtMoney(a.landedCost)}</Td>
                      <Td className="text-xs">{o.shipDaysMin ?? "?"}–{o.shipDaysMax ?? "?"} d</Td>
                      <Td className={`text-right tabular-nums ${a.reliabilityScore >= 75 ? "text-good" : a.reliabilityScore >= 50 ? "text-warn" : "text-bad"}`}>{a.reliabilityScore}</Td>
                      <Td><div className="flex flex-wrap gap-1">{a.flags.filter((f) => f.severity !== "info").map((f) => <Badge key={f.code} tone={f.severity === "critical" ? "bad" : "warn"} title={f.message}>{f.code.replace(/_/g, " ")}</Badge>)}</div></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
