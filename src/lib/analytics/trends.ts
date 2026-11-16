/**
 * Deterministic trend analysis for a time series of measurements (e.g. Google
 * Trends weekly search interest). No AI involved: every classification can be
 * traced to the thresholds below.
 */
import { DAY_MS, mean, pearson, round, slope, stddev } from "./math";

export type TrendClass =
  | "emerging"
  | "rapidly_rising"
  | "stable"
  | "seasonal"
  | "saturating"
  | "declining"
  | "insufficient_data";

export const TREND_LABELS: Record<TrendClass, string> = {
  emerging: "Emerging",
  rapidly_rising: "Rapidly rising",
  stable: "Stable",
  seasonal: "Seasonal",
  saturating: "Saturating",
  declining: "Declining",
  insufficient_data: "Insufficient data",
};

export interface SeriesPoint {
  date: string; // ISO date/time
  value: number;
}

export interface TrendAnalysis {
  classification: TrendClass;
  pointCount: number;
  spanDays: number;
  sufficient: boolean;
  /** % change of the recent window mean vs the baseline window mean. */
  growthPct: number | null;
  /** Change in growth between the two most recent halves (percentage points). */
  accelerationPct: number | null;
  recentMean: number | null;
  baselineMean: number | null;
  peak: number | null;
  peakDate: string | null;
  /** Coefficient of variation of the whole series. */
  volatility: number | null;
  seasonality: { detected: boolean; correlation: number | null; peakMonths: number[] };
  reasons: string[];
}

export const TREND_RULES = {
  minPoints: 8,
  minSpanDays: 49,
  recentFraction: 0.25, // last 25% of points (min 4)
  baselineFraction: 0.5, // the 50% of points before the recent window
  rapidGrowthPct: 100,
  emergingGrowthPct: 25,
  declineGrowthPct: -20,
  saturationLevelOfPeak: 0.7,
  seasonalCorrelation: 0.6,
  seasonalMinCv: 0.2,
} as const;

export type CompetitionTrend = "rising" | "flat" | "falling" | null;

export function sortSeries(points: SeriesPoint[]): SeriesPoint[] {
  return [...points]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function pctChange(recent: number, baseline: number): number | null {
  if (baseline <= 0) {
    if (recent <= 0) return 0;
    return null; // undefined growth from a zero base — handled by caller
  }
  return ((recent - baseline) / baseline) * 100;
}

function monthlyProfile(points: SeriesPoint[], year: number): number[] | null {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const p of points) {
    const d = new Date(p.date);
    if (d.getUTCFullYear() === year) buckets[d.getUTCMonth()].push(p.value);
  }
  if (buckets.some((b) => b.length === 0)) return null;
  return buckets.map((b) => mean(b)!);
}

export function detectSeasonality(points: SeriesPoint[]): TrendAnalysis["seasonality"] {
  const sorted = sortSeries(points);
  if (sorted.length < 2) return { detected: false, correlation: null, peakMonths: [] };
  const lastYear = new Date(sorted[sorted.length - 1].date).getUTCFullYear();
  // Compare the two most recent complete calendar years available.
  for (const y of [lastYear - 1, lastYear]) {
    const a = monthlyProfile(sorted, y - 1);
    const b = monthlyProfile(sorted, y);
    if (!a || !b) continue;
    const r = pearson(a, b);
    const combined = a.map((v, i) => (v + b[i]) / 2);
    const m = mean(combined)!;
    const cv = m > 0 ? (stddev(combined) ?? 0) / m : 0;
    const detected = r !== null && r >= TREND_RULES.seasonalCorrelation && cv >= TREND_RULES.seasonalMinCv;
    const max = Math.max(...combined);
    const peakMonths = combined
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v >= max * 0.85)
      .map((x) => x.i + 1);
    return { detected, correlation: r === null ? null : round(r, 3), peakMonths: detected ? peakMonths : [] };
  }
  return { detected: false, correlation: null, peakMonths: [] };
}

export function analyzeTrend(
  input: SeriesPoint[],
  opts: { competitionTrend?: CompetitionTrend } = {},
): TrendAnalysis {
  const points = sortSeries(input);
  const n = points.length;
  const spanDays =
    n >= 2 ? (new Date(points[n - 1].date).getTime() - new Date(points[0].date).getTime()) / DAY_MS : 0;
  const values = points.map((p) => p.value);
  const base: TrendAnalysis = {
    classification: "insufficient_data",
    pointCount: n,
    spanDays: Math.round(spanDays),
    sufficient: false,
    growthPct: null,
    accelerationPct: null,
    recentMean: null,
    baselineMean: null,
    peak: n ? Math.max(...values) : null,
    peakDate: n ? points[values.indexOf(Math.max(...values))].date : null,
    volatility: null,
    seasonality: { detected: false, correlation: null, peakMonths: [] },
    reasons: [],
  };
  if (n < TREND_RULES.minPoints || spanDays < TREND_RULES.minSpanDays) {
    base.reasons.push(
      `Only ${n} data point(s) over ${Math.round(spanDays)} days; at least ${TREND_RULES.minPoints} points over ${TREND_RULES.minSpanDays} days are required.`,
    );
    return base;
  }

  const recentN = Math.max(4, Math.round(n * TREND_RULES.recentFraction));
  const baselineN = Math.max(4, Math.round(n * TREND_RULES.baselineFraction));
  const recent = values.slice(-recentN);
  const baseline = values.slice(Math.max(0, n - recentN - baselineN), n - recentN);
  const recentMean = mean(recent)!;
  const baselineMean = mean(baseline) ?? 0;
  let growth = pctChange(recentMean, baselineMean);
  if (growth === null) growth = recentMean > 0 ? 200 : 0; // rising from a zero base

  // Acceleration: growth of the last half of the recent window vs its first half.
  const half = Math.floor(recent.length / 2);
  const firstHalf = mean(recent.slice(0, half)) ?? recentMean;
  const secondHalf = mean(recent.slice(half)) ?? recentMean;
  const accel = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : null;

  const m = mean(values)!;
  const volatility = m > 0 ? (stddev(values) ?? 0) / m : null;
  const seasonality = detectSeasonality(points);
  const peak = Math.max(...values);
  const peakIndex = values.lastIndexOf(peak);
  const peakAgeDays = (new Date(points[n - 1].date).getTime() - new Date(points[peakIndex].date).getTime()) / DAY_MS;

  const result: TrendAnalysis = {
    ...base,
    sufficient: true,
    growthPct: round(growth, 1),
    accelerationPct: accel === null ? null : round(accel, 1),
    recentMean: round(recentMean, 2),
    baselineMean: round(baselineMean, 2),
    peak,
    peakDate: points[peakIndex].date,
    volatility: volatility === null ? null : round(volatility, 3),
    seasonality,
    reasons: [],
  };
  const g = result.growthPct!;
  const recentSlope = slope(recent) ?? 0;

  if (seasonality.detected) {
    result.classification = "seasonal";
    result.reasons.push(
      `Year-over-year monthly pattern correlation ${seasonality.correlation} ≥ ${TREND_RULES.seasonalCorrelation}; peaks in month(s) ${seasonality.peakMonths.join(", ")}.`,
    );
  } else if (g >= TREND_RULES.rapidGrowthPct) {
    result.classification = "rapidly_rising";
    result.reasons.push(`Recent average is ${g}% above the baseline (≥ ${TREND_RULES.rapidGrowthPct}%).`);
  } else if (g >= TREND_RULES.emergingGrowthPct) {
    result.classification = "emerging";
    result.reasons.push(`Recent average is ${g}% above the baseline (≥ ${TREND_RULES.emergingGrowthPct}%).`);
  } else if (g <= TREND_RULES.declineGrowthPct) {
    result.classification = "declining";
    result.reasons.push(`Recent average is ${g}% versus the baseline (≤ ${TREND_RULES.declineGrowthPct}%).`);
  } else if (
    recentMean >= peak * TREND_RULES.saturationLevelOfPeak &&
    peakAgeDays >= 56 &&
    recentSlope <= 0 &&
    opts.competitionTrend === "rising"
  ) {
    result.classification = "saturating";
    result.reasons.push(
      `Demand has plateaued near its peak (peak ${Math.round(peakAgeDays)} days ago) while competition indicators are rising.`,
    );
  } else {
    result.classification = "stable";
    result.reasons.push(`Recent average is within ${TREND_RULES.declineGrowthPct}%…+${TREND_RULES.emergingGrowthPct}% of the baseline (${g}%).`);
  }
  return result;
}

export type RangeKey = "7d" | "30d" | "90d" | "12m" | "all";
export const RANGE_DAYS: Record<RangeKey, number | null> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365, all: null };

export function filterRange(points: SeriesPoint[], range: RangeKey, now = new Date()): SeriesPoint[] {
  const days = RANGE_DAYS[range];
  const sorted = sortSeries(points);
  if (days === null) return sorted;
  const from = now.getTime() - days * DAY_MS;
  return sorted.filter((p) => new Date(p.date).getTime() >= from);
}

/**
 * Percentage change between the selected window and the immediately
 * preceding window of equal length. Returns null (and a reason) unless both
 * windows contain enough comparable points.
 */
export function windowChange(
  points: SeriesPoint[],
  range: RangeKey,
  now = new Date(),
  minPointsPerWindow = 2,
): { pct: number | null; reason: string } {
  const days = RANGE_DAYS[range];
  if (days === null) return { pct: null, reason: "No comparison window for “all history”." };
  const end = now.getTime();
  const start = end - days * DAY_MS;
  const prevStart = start - days * DAY_MS;
  const sorted = sortSeries(points);
  const cur = sorted.filter((p) => {
    const t = new Date(p.date).getTime();
    return t >= start && t <= end;
  });
  const prev = sorted.filter((p) => {
    const t = new Date(p.date).getTime();
    return t >= prevStart && t < start;
  });
  if (cur.length < minPointsPerWindow || prev.length < minPointsPerWindow) {
    return {
      pct: null,
      reason: `Not enough comparable data (${cur.length} point(s) in this window, ${prev.length} in the previous one; ${minPointsPerWindow} needed in each).`,
    };
  }
  const a = mean(prev.map((p) => p.value))!;
  const b = mean(cur.map((p) => p.value))!;
  if (a === 0) return { pct: null, reason: "Previous window averages zero; percentage change is undefined." };
  return { pct: round(((b - a) / a) * 100, 1), reason: `Mean of ${cur.length} vs ${prev.length} points.` };
}

/** Direction of a sparse indicator (e.g. active ad counts) from first to last observation. */
export function indicatorDirection(points: SeriesPoint[], thresholdPct = 15): CompetitionTrend {
  const s = sortSeries(points);
  if (s.length < 2) return null;
  const first = s[0].value;
  const last = s[s.length - 1].value;
  if (first === 0) return last > 0 ? "rising" : "flat";
  const pct = ((last - first) / first) * 100;
  if (pct >= thresholdPct) return "rising";
  if (pct <= -thresholdPct) return "falling";
  return "flat";
}
