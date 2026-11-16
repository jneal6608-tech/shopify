/**
 * Watchlist alert evaluation. Pure: given the previous and current state of a
 * product, returns alert candidates with stable dedupe keys so the same
 * change is never reported twice.
 */
import type { TrendClass } from "./trends";

export interface AlertThresholds {
  scoreChange: number;
  substantialGrowthPct: number;
  declinePct: number;
  competitionIncreasePct: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  scoreChange: 8,
  substantialGrowthPct: 50,
  declinePct: -20,
  competitionIncreasePct: 30,
};

export interface ProductState {
  scoreId: string | null;
  total: number | null;
  trendClass: TrendClass | null;
  growthPct: number | null;
  activeAds: number | null;
  trackedCompetitors: number;
}

export interface AlertCandidate {
  kind: "trend_up" | "substantial_growth" | "competition_increase" | "demand_decline" | "score_change";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}

const UP: TrendClass[] = ["emerging", "rapidly_rising"];

export function evaluateAlerts(
  productId: string,
  productName: string,
  prev: ProductState | null,
  cur: ProductState,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const key = (kind: string, ref: string | number | null) => `${kind}:${productId}:${ref ?? "na"}`;
  if (!prev) return out; // first observation — nothing to compare against

  if (cur.trendClass && UP.includes(cur.trendClass) && prev.trendClass && !UP.includes(prev.trendClass)) {
    out.push({
      kind: "trend_up",
      severity: "info",
      title: `${productName} is trending upward`,
      message: `Trend changed from “${prev.trendClass}” to “${cur.trendClass}”.`,
      dedupeKey: key("trend_up", cur.scoreId),
      data: { from: prev.trendClass, to: cur.trendClass, growthPct: cur.growthPct },
    });
  }
  if (cur.growthPct !== null && cur.growthPct >= thresholds.substantialGrowthPct && (prev.growthPct ?? 0) < thresholds.substantialGrowthPct) {
    out.push({
      kind: "substantial_growth",
      severity: "warning",
      title: `${productName}: substantial demand growth`,
      message: `Search interest growth reached ${cur.growthPct}% (threshold ${thresholds.substantialGrowthPct}%).`,
      dedupeKey: key("substantial_growth", cur.scoreId),
      data: { growthPct: cur.growthPct },
    });
  }
  if (cur.growthPct !== null && cur.growthPct <= thresholds.declinePct && (prev.growthPct === null || prev.growthPct > thresholds.declinePct)) {
    out.push({
      kind: "demand_decline",
      severity: "warning",
      title: `${productName}: demand declining`,
      message: `Search interest growth fell to ${cur.growthPct}% (threshold ${thresholds.declinePct}%).`,
      dedupeKey: key("demand_decline", cur.scoreId),
      data: { growthPct: cur.growthPct },
    });
  }
  if (prev.activeAds !== null && cur.activeAds !== null && prev.activeAds > 0) {
    const pct = ((cur.activeAds - prev.activeAds) / prev.activeAds) * 100;
    if (pct >= thresholds.competitionIncreasePct) {
      out.push({
        kind: "competition_increase",
        severity: "warning",
        title: `${productName}: competition increasing`,
        message: `Active ads rose from ${prev.activeAds} to ${cur.activeAds} (+${Math.round(pct)}%).`,
        dedupeKey: key("competition_increase", `${cur.activeAds}`),
        data: { from: prev.activeAds, to: cur.activeAds },
      });
    }
  }
  if (cur.trackedCompetitors - prev.trackedCompetitors >= 3) {
    out.push({
      kind: "competition_increase",
      severity: "info",
      title: `${productName}: more competitors tracked`,
      message: `Tracked competitors increased from ${prev.trackedCompetitors} to ${cur.trackedCompetitors}.`,
      dedupeKey: key("competition_increase_tracked", cur.trackedCompetitors),
      data: {},
    });
  }
  if (prev.total !== null && cur.total !== null && Math.abs(cur.total - prev.total) >= thresholds.scoreChange) {
    const up = cur.total > prev.total;
    out.push({
      kind: "score_change",
      severity: up ? "info" : "warning",
      title: `${productName}: opportunity score ${up ? "up" : "down"} ${Math.abs(Math.round(cur.total - prev.total))}`,
      message: `Opportunity score moved from ${prev.total} to ${cur.total}.`,
      dedupeKey: key("score_change", cur.scoreId),
      data: { from: prev.total, to: cur.total },
    });
  }
  return out;
}
