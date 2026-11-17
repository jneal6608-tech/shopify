import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { supplierOffersFor } from "@/lib/services/suppliers";
import { compareOffers } from "@/lib/analytics/suppliers";
import { Badge, Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui/primitives";
import { AddRecordButton } from "@/components/ui/add-record";
import { ActionButton } from "@/components/ui/action";
import { fmtMoney, fmtNum } from "@/lib/utils";

export async function SuppliersTab({ userId, product: p }: { userId: string; product: ProductOverview }) {
  const { offers, suppliers } = await withUser(userId, async (db) => ({
    offers: await supplierOffersFor(db, p.id),
    suppliers: await db<{ id: string; name: string }[]>`select id, name from public.suppliers order by name`,
  }));
  const assessed = compareOffers(offers);
  const byId = new Map(offers.map((o) => [o.offerId, o]));
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Supplier offers (${offers.length})`}
          description="Ranked by reliability band, then landed cost. Every supplier starts untrusted: missing information is flagged, not assumed."
          action={
            <div className="flex gap-2">
              <AddRecordButton preset="supplier" endpoint="/api/suppliers" title="New supplier" label="New supplier" />
              {suppliers.length > 0 && <AddRecordButton preset="offer" suppliers={suppliers} endpoint={`/api/products/${p.id}/offers`} title="Add supplier offer" label="Add offer" variant="primary" />}
              {offers.length > 0 && <ActionButton size="sm" variant="secondary" endpoint={`/api/products/${p.id}/supplier-report`}>Save reliability report</ActionButton>}
            </div>
          }
        />
        {suppliers.length === 0 && <CardBody><Notice>Create a supplier first, then add its offer for this product.</Notice></CardBody>}
        {assessed.length > 0 && (
          <Table>
            <thead><tr><Th>#</Th><Th>Supplier</Th><Th className="text-right">Unit</Th><Th className="text-right">Ship</Th><Th className="text-right">Landed</Th><Th>Delivery</Th><Th className="text-right">Ratings</Th><Th className="text-right">Reliability</Th><Th>Flags</Th><Th /></tr></thead>
            <tbody>
              {assessed.map((a) => {
                const o = byId.get(a.offerId)!;
                return (
                  <tr key={a.offerId}>
                    <Td className="text-faint">{a.rank}</Td>
                    <Td><div className="font-medium">{o.url ? <a href={o.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{o.supplierName}</a> : o.supplierName}</div><div className="text-[11px] text-faint">{o.platform}{o.moq && o.moq > 1 ? ` · MOQ ${o.moq}` : ""}{o.variants.length ? ` · ${o.variants.length} variants` : ""}</div></Td>
                    <Td className="text-right tabular-nums">{fmtMoney(o.unitCost)}</Td>
                    <Td className="text-right tabular-nums">{fmtMoney(o.shippingCost)}</Td>
                    <Td className="text-right font-medium tabular-nums">{fmtMoney(a.landedCost)}</Td>
                    <Td className="whitespace-nowrap text-xs">{o.shipDaysMin ?? "?"}–{o.shipDaysMax ?? "?"} days</Td>
                    <Td className="text-right text-xs tabular-nums">store {o.storeRating ?? "—"} ({fmtNum(o.storeReviewCount)}) · item {o.productRating ?? "—"}</Td>
                    <Td className="text-right"><span className={a.reliabilityScore >= 75 ? "text-good" : a.reliabilityScore >= 50 ? "text-warn" : "text-bad"}>{a.reliabilityScore}</span></Td>
                    <Td className="max-w-80">
                      <div className="flex flex-wrap gap-1">
                        {a.flags.map((f) => <Badge key={f.code} tone={f.severity === "critical" ? "bad" : f.severity === "warning" ? "warn" : "neutral"} title={f.message}>{f.code.replace(/_/g, " ")}</Badge>)}
                      </div>
                    </Td>
                    <Td><ActionButton size="sm" variant="ghost" endpoint={`/api/offers/${a.offerId}`} method="DELETE" confirm="Delete this offer?">×</ActionButton></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {assessed.length > 0 && (
        <Card>
          <CardHeader title="Flag details" />
          <CardBody className="grid gap-3 text-xs md:grid-cols-2">
            {assessed.map((a) => (
              <div key={a.offerId}>
                <p className="font-medium">{a.supplierName}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{a.flags.length ? a.flags.map((f) => <li key={f.code}>{f.message}</li>) : <li>No flags raised by the recorded information.</li>}</ul>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      <p className="text-[11px] text-faint">The cheapest landed offer replaces your manual cost estimate in scoring. Order and grade a sample (sample quality 1–5) before committing: a sample rated ≥4 raises reliability; ≤2 is a critical flag.</p>
    </div>
  );
}
