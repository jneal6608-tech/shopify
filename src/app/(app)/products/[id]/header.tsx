import type { ProductOverview } from "@/lib/services/products";
import { Badge } from "@/components/ui/primitives";
import { DemoBadge, RecommendationBadge, scoreTone, TrendBadge } from "@/components/ui/domain";
import { STAGE_LABELS } from "@/lib/validation/common";
import { cn, relTime } from "@/lib/utils";
import { ProductActions } from "./actions";

export function ProductHeader({ product: p, categories }: { product: ProductOverview; categories: Array<{ id: string; name: string }> }) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 gap-4">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-[10px] text-faint">No image</div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
            {p.isDemo && <DemoBadge />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge>{STAGE_LABELS[p.stage]}</Badge>
            {p.categoryName && <Badge>{p.categoryName}</Badge>}
            {p.niche && <Badge>{p.niche}</Badge>}
            <TrendBadge value={p.trendClass} />
            <RecommendationBadge value={p.recommendation} />
            <span className="text-faint">Scored {relTime(p.scoredAt)}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-4">
            <span><span className={cn("text-2xl font-semibold tabular-nums", scoreTone(p.scoreTotal))}>{p.scoreTotal === null ? "—" : Math.round(p.scoreTotal)}</span> <span className="text-xs text-faint">opportunity</span></span>
            <span><span className="text-lg font-semibold tabular-nums text-muted">{p.scoreConfidence === null ? "—" : Math.round(p.scoreConfidence)}</span> <span className="text-xs text-faint">confidence</span></span>
          </div>
        </div>
      </div>
      <ProductActions product={p} categories={categories} />
    </div>
  );
}
