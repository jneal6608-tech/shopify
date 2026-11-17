import Link from "next/link";
import type { ProductOverview } from "@/lib/services/products";
import { Badge, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, RecommendationBadge, scoreTone, TrendBadge } from "@/components/ui/domain";
import { cn, fmtMoney, fmtPct, relTime } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/validation/common";
import { CompareToggle } from "./compare-tray";

export function ProductTable({ products, showStage = true }: { products: ProductOverview[]; showStage?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Product</Th>
          <Th className="text-right">Opportunity</Th>
          <Th className="text-right">Confidence</Th>
          <Th>Demand</Th>
          <Th className="text-right">Growth</Th>
          <Th className="text-right">Content</Th>
          <Th className="text-right">Competition</Th>
          <Th className="text-right">Cost / Price</Th>
          <Th className="text-right">Est. margin</Th>
          {showStage && <Th>Stage</Th>}
          <Th />
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p.id} className="hover:bg-panel-2/50">
            <Td className="min-w-56">
              <div className="flex items-start gap-2.5">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-md border border-border bg-panel-2" />
                )}
                <div className="min-w-0">
                  <Link href={`/products/${p.id}`} className="font-medium text-fg hover:text-accent">{p.name}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-faint">
                    {p.isDemo && <DemoBadge />}
                    {p.categoryName && <span>{p.categoryName}</span>}
                    {p.isBookmarked && <Badge tone="accent">★</Badge>}
                    {p.onWatchlist && <Badge tone="info">Watching</Badge>}
                    <span>· scored {relTime(p.scoredAt)}</span>
                  </div>
                </div>
              </div>
            </Td>
            <Td className="text-right"><span className={cn("font-semibold tabular-nums", scoreTone(p.scoreTotal))}>{p.scoreTotal === null ? "—" : Math.round(p.scoreTotal)}</span><div className="mt-1"><RecommendationBadge value={p.recommendation} /></div></Td>
            <Td className="text-right tabular-nums text-muted">{p.scoreConfidence === null ? "—" : Math.round(p.scoreConfidence)}</Td>
            <Td><TrendBadge value={p.trendClass} /></Td>
            <Td className="text-right tabular-nums">{fmtPct(p.growthPct, 0, true)}</Td>
            <Td className={cn("text-right tabular-nums", scoreTone(p.contentScore))}>{p.contentScore === null ? "—" : Math.round(p.contentScore)}</Td>
            <Td className={cn("text-right tabular-nums", scoreTone(p.competitionScore))}>{p.competitionScore === null ? "—" : Math.round(p.competitionScore)}</Td>
            <Td className="whitespace-nowrap text-right tabular-nums text-muted">{fmtMoney(p.estSupplierCost)} / {fmtMoney(p.estSellingPrice)}</Td>
            <Td className="text-right tabular-nums">{fmtPct(p.estGrossMarginPct, 0)}</Td>
            {showStage && <Td className="whitespace-nowrap text-xs text-muted">{STAGE_LABELS[p.stage]}</Td>}
            <Td><CompareToggle id={p.id} compact /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
