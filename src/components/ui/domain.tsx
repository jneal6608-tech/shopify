import { Badge } from "./primitives";
import { cn } from "@/lib/utils";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/analytics/scoring";
import { TREND_LABELS, type TrendClass } from "@/lib/analytics/trends";

export function scoreTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "text-faint";
  if (v >= 72) return "text-good";
  if (v >= 58) return "text-info";
  if (v >= 40) return "text-warn";
  return "text-bad";
}

export function ScorePill({ value, label = "Opportunity", confidence }: { value: number | null | undefined; label?: string; confidence?: number | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn("text-lg font-semibold tabular-nums", scoreTone(value))}>{value === null || value === undefined ? "—" : Math.round(value)}</span>
      <span className="text-[11px] text-faint">
        {label}
        {confidence !== undefined && confidence !== null && <> · conf {Math.round(confidence)}</>}
      </span>
    </div>
  );
}

export function ScoreBar({ value, weight }: { value: number | null; weight?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className={cn("h-full rounded-full", value === null ? "bg-faint/40" : v >= 72 ? "bg-good" : v >= 58 ? "bg-info" : v >= 40 ? "bg-warn" : "bg-bad")}
          style={{ width: `${value === null ? 100 : Math.max(2, v)}%`, opacity: value === null ? 0.25 : 1 }}
        />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-muted">
        {value === null ? "missing" : Math.round(v)}
        {weight !== undefined && <span className="text-faint"> ·{weight}%</span>}
      </span>
    </div>
  );
}

const recTone: Record<Recommendation, "good" | "info" | "warn" | "bad" | "neutral"> = {
  strong_candidate: "good",
  worth_investigating: "info",
  monitor: "neutral",
  too_competitive: "bad",
  weak_profit: "bad",
  insufficient_evidence: "warn",
  avoid_for_now: "bad",
};
export function RecommendationBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge>Not scored</Badge>;
  const v = value as Recommendation;
  return <Badge tone={recTone[v] ?? "neutral"}>{RECOMMENDATION_LABELS[v] ?? value}</Badge>;
}

const trendTone: Record<TrendClass, "good" | "info" | "warn" | "bad" | "neutral" | "accent"> = {
  emerging: "info",
  rapidly_rising: "good",
  stable: "neutral",
  seasonal: "accent",
  saturating: "warn",
  declining: "bad",
  insufficient_data: "neutral",
};
export function TrendBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge>No trend data</Badge>;
  const v = value as TrendClass;
  return <Badge tone={trendTone[v] ?? "neutral"}>{TREND_LABELS[v] ?? value}</Badge>;
}

/** Labels where a number came from. Measured ≠ estimate ≠ AI ≠ demo. */
export function Provenance({ kind, estimate, demo }: { kind: string; estimate?: boolean; demo?: boolean }) {
  if (demo) return <Badge tone="demo" title="Synthetic demo data — not market intelligence">DEMO</Badge>;
  if (estimate) return <Badge tone="warn" title="Estimate, not a measurement">Estimate</Badge>;
  const map: Record<string, { label: string; tone: "good" | "info" | "warn" | "accent" | "neutral"; title: string }> = {
    api: { label: "Measured", tone: "good", title: "Retrieved from an API" },
    csv_import: { label: "Imported", tone: "good", title: "Imported from an official export" },
    manual: { label: "Manual", tone: "info", title: "Recorded by hand with a source link" },
    derived: { label: "Derived", tone: "neutral", title: "Computed from records on this platform" },
    ai: { label: "AI interpretation", tone: "accent", title: "Produced by Claude — not a measurement" },
    measured: { label: "Measured", tone: "good", title: "Measured data" },
    assessment_user: { label: "Your rating", tone: "info", title: "Rubric rated by you" },
    assessment_ai: { label: "AI estimate", tone: "accent", title: "Rubric suggested by Claude — confirm to raise confidence" },
    mixed: { label: "Mixed", tone: "neutral", title: "Multiple input types" },
    none: { label: "Missing", tone: "neutral", title: "No data" },
  };
  const m = map[kind] ?? { label: kind, tone: "neutral" as const, title: kind };
  return <Badge tone={m.tone} title={m.title}>{m.label}</Badge>;
}

export function DemoBadge() {
  return <Badge tone="demo" title="Synthetic demo data — not market intelligence">DEMO DATA</Badge>;
}
