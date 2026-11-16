/**
 * Opportunity & confidence scoring — formula version "v1".
 *
 * Design rules (from the product brief):
 *  1. Scores come from transparent formulas over measurable inputs. The AI
 *     never sets or adjusts a score; it only explains one.
 *  2. Missing data never receives a favourable score: a component without
 *     data is imputed at MISSING_COMPONENT_SCORE (well below neutral) and is
 *     listed in `missing`, and it lowers the confidence score.
 *  3. Every component reports the inputs it used and a plain-language
 *     explanation, so the UI can show exactly why a product scored as it did.
 */
import { clamp, daysBetween, mean, piecewise, round } from "./math";
import { computeUnitEconomics, DEFAULT_PROFIT_INPUT, type ProfitInput } from "./profit";
import {
  FACELESS_FORMATS,
  type ContentRatings,
  type LongevityRatings,
  type ProblemRatings,
} from "./rubrics";
import { analyzeTrend, indicatorDirection, type SeriesPoint, type TrendAnalysis, type TrendClass } from "./trends";
import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey, type ScoringWeights } from "./weights";

export const FORMULA_VERSION = "v1";
export const MISSING_COMPONENT_SCORE = 25;
export const AI_ASSESSMENT_RELIABILITY = 0.35;
export const USER_ASSESSMENT_RELIABILITY = 0.6;

export interface Observation {
  value: number;
  observedAt: string;
  sourceKey: string;
  reliability: number;
  isEstimate: boolean;
  isDemo: boolean;
}

export interface Assessment<T> {
  ratings: T;
  assessedBy: "user" | "ai";
  at: string;
}

export interface ScoringInput {
  now: Date;
  /** Weekly (or daily) search-interest series from a single source. */
  search: { points: SeriesPoint[]; sourceKey: string; reliability: number; isDemo: boolean } | null;
  /** Additional demand-direction signals (used for source agreement only). */
  socialSeries: Array<{ metric: string; points: SeriesPoint[] }>;
  competition: {
    metaActiveAds: Observation | null;
    metaAdsHistory: SeriesPoint[];
    youtubeRecentVideos: Observation | null;
    amazonTopReviewCount: Observation | null;
    trackedCompetitors: number;
    competitorsLatestAt: string | null;
  };
  economics: {
    sellingPrice: number | null;
    supplierCost: number | null;
    shippingCost: number | null;
    /** Reliability of the cost/price basis (supplier offer > manual estimate). */
    reliability: number;
    latestAt: string | null;
    fees?: Partial<Omit<ProfitInput, "sellingPrice" | "supplierCost" | "shippingCost">>;
  };
  assessments: {
    content: Assessment<ContentRatings> | null;
    problem: Assessment<ProblemRatings> | null;
    longevity: Assessment<LongevityRatings> | null;
  };
  shipping: {
    weightGrams: number | null;
    isFragile: boolean | null;
    shipDaysMax: number | null;
    shippingCost: number | null;
    sellingPrice: number | null;
    reliability: number;
    latestAt: string | null;
  };
}

export interface ComponentResult {
  key: ComponentKey;
  label: string;
  weight: number;
  /** null = no usable data. */
  score: number | null;
  /** Score used in the weighted total (imputed when missing). */
  effectiveScore: number;
  reliability: number | null;
  latestAt: string | null;
  basis: "measured" | "manual" | "assessment_user" | "assessment_ai" | "mixed" | "none";
  inputs: Record<string, number | string | boolean | null>;
  explanation: string[];
}

export type Recommendation =
  | "strong_candidate"
  | "worth_investigating"
  | "monitor"
  | "too_competitive"
  | "weak_profit"
  | "insufficient_evidence"
  | "avoid_for_now";

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_candidate: "Strong candidate for testing",
  worth_investigating: "Worth investigating",
  monitor: "Monitor for further growth",
  too_competitive: "Too competitive",
  weak_profit: "Weak profit potential",
  insufficient_evidence: "Insufficient evidence",
  avoid_for_now: "Avoid for now",
};

export interface ConfidenceBreakdown {
  completeness: number;
  reliability: number;
  freshness: number;
  agreement: number;
  sampleSize: number;
}

export const CONFIDENCE_WEIGHTS: ConfidenceBreakdown = {
  completeness: 0.35,
  reliability: 0.2,
  freshness: 0.2,
  agreement: 0.1,
  sampleSize: 0.15,
};

export interface ScoreResult {
  formulaVersion: string;
  total: number;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  recommendation: Recommendation;
  reasons: string[];
  components: ComponentResult[];
  missing: string[];
  trend: TrendAnalysis;
  weights: ScoringWeights;
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Component formulas
// ---------------------------------------------------------------------------

const GROWTH_CURVE = [
  [-60, 0],
  [-20, 20],
  [0, 40],
  [25, 60],
  [60, 78],
  [120, 90],
  [250, 100],
] as const;

function demandComponent(input: ScoringInput, trend: TrendAnalysis): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "demand" as const, label: COMPONENT_LABELS.demand };
  if (!input.search || !trend.sufficient || trend.growthPct === null) {
    return {
      ...base,
      score: null,
      reliability: null,
      latestAt: null,
      basis: "none",
      inputs: { points: input.search?.points.length ?? 0 },
      explanation: ["No sufficient search-interest series.", ...trend.reasons],
    };
  }
  let score = piecewise(trend.growthPct, GROWTH_CURVE);
  const explanation = [`Search interest growth ${trend.growthPct}% → ${round(score, 1)} on the growth curve.`];
  if (trend.accelerationPct !== null) {
    const adj = trend.accelerationPct > 10 ? 5 : trend.accelerationPct < -10 ? -5 : 0;
    if (adj !== 0) {
      score += adj;
      explanation.push(`${adj > 0 ? "Accelerating" : "Decelerating"} recent momentum (${trend.accelerationPct}%): ${adj > 0 ? "+" : ""}${adj}.`);
    }
  }
  if (trend.classification === "seasonal") {
    score -= 5;
    explanation.push("Seasonal pattern: −5 (growth may reflect the season, not a trend).");
  }
  const latest = input.search.points.at(-1)?.date ?? null;
  return {
    ...base,
    score: round(clamp(score), 1),
    reliability: input.search.reliability,
    latestAt: latest,
    basis: "measured",
    inputs: {
      growthPct: trend.growthPct,
      accelerationPct: trend.accelerationPct,
      points: trend.pointCount,
      classification: trend.classification,
      source: input.search.sourceKey,
    },
    explanation,
  };
}

function contentComponent(input: ScoringInput): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "content" as const, label: COMPONENT_LABELS.content };
  const a = input.assessments.content;
  if (!a) {
    return { ...base, score: null, reliability: null, latestAt: null, basis: "none", inputs: {}, explanation: ["No faceless-content assessment yet."] };
  }
  const values = FACELESS_FORMATS.map((f) => a.ratings[f.key] ?? 0);
  const top5 = [...values].sort((x, y) => y - x).slice(0, 5);
  // A product only needs a handful of strong formats: weight the best five.
  const raw = 0.7 * (mean(top5)! / 3) + 0.3 * (mean(values)! / 3);
  const strong = FACELESS_FORMATS.filter((f) => (a.ratings[f.key] ?? 0) >= 3).map((f) => f.label);
  return {
    ...base,
    score: round(clamp(raw * 100), 1),
    reliability: a.assessedBy === "ai" ? AI_ASSESSMENT_RELIABILITY : USER_ASSESSMENT_RELIABILITY,
    latestAt: a.at,
    basis: a.assessedBy === "ai" ? "assessment_ai" : "assessment_user",
    inputs: { top5Mean: round(mean(top5)!, 2), allMean: round(mean(values)!, 2), assessedBy: a.assessedBy },
    explanation: [
      `70% best-five format average (${round(mean(top5)!, 2)}/3) + 30% all-format average (${round(mean(values)!, 2)}/3).`,
      strong.length ? `Excellent formats: ${strong.join(", ")}.` : "No format rated excellent.",
      a.assessedBy === "ai" ? "Rated by AI (estimate) — confirm or adjust to raise confidence." : "Rated by you.",
    ],
  };
}

const MARGIN_CURVE = [
  [0, 0],
  [0.15, 20],
  [0.3, 50],
  [0.45, 75],
  [0.6, 92],
  [0.7, 100],
] as const;
const ABS_CONTRIBUTION_CURVE = [
  [0, 0],
  [5, 25],
  [10, 50],
  [20, 80],
  [35, 100],
] as const;
/** Conservative assumption when shipping cost is unknown. */
export const ASSUMED_SHIPPING_WHEN_MISSING = 6;

function profitComponent(input: ScoringInput): Omit<ComponentResult, "weight" | "effectiveScore"> & { missingNotes: string[] } {
  const base = { key: "profit" as const, label: COMPONENT_LABELS.profit };
  const e = input.economics;
  const missingNotes: string[] = [];
  if (e.sellingPrice === null || e.supplierCost === null || e.sellingPrice <= 0) {
    return {
      ...base,
      score: null,
      reliability: null,
      latestAt: null,
      basis: "none",
      inputs: { sellingPrice: e.sellingPrice, supplierCost: e.supplierCost },
      explanation: ["Selling price and supplier cost are both required."],
      missingNotes,
    };
  }
  let shipping = e.shippingCost;
  const explanation: string[] = [];
  if (shipping === null) {
    shipping = ASSUMED_SHIPPING_WHEN_MISSING;
    missingNotes.push("Shipping cost (assumed $6 conservatively)");
    explanation.push(`Shipping cost unknown — assumed $${ASSUMED_SHIPPING_WHEN_MISSING} (conservative).`);
  }
  const u = computeUnitEconomics({
    ...DEFAULT_PROFIT_INPUT,
    ...e.fees,
    marketingPerUnit: 0,
    sellingPrice: e.sellingPrice,
    supplierCost: e.supplierCost,
    shippingCost: shipping,
  });
  const margin = u.contributionBeforeMarketing / e.sellingPrice;
  const marginScore = u.contributionBeforeMarketing <= 0 ? 0 : piecewise(margin, MARGIN_CURVE);
  const absScore = u.contributionBeforeMarketing <= 0 ? 0 : piecewise(u.contributionBeforeMarketing, ABS_CONTRIBUTION_CURVE);
  const score = 0.6 * marginScore + 0.4 * absScore;
  explanation.push(
    `Contribution before marketing $${u.contributionBeforeMarketing} (${u.contributionMarginPct}% margin).`,
    `60% margin score (${round(marginScore, 1)}) + 40% absolute contribution score (${round(absScore, 1)}).`,
  );
  return {
    ...base,
    score: round(clamp(score), 1),
    reliability: shipping === e.shippingCost ? e.reliability : e.reliability * 0.8,
    latestAt: e.latestAt,
    basis: "manual",
    inputs: {
      sellingPrice: e.sellingPrice,
      supplierCost: e.supplierCost,
      shippingCost: shipping,
      contribution: u.contributionBeforeMarketing,
      marginPct: u.contributionMarginPct,
    },
    explanation,
    missingNotes,
  };
}

const ADS_PRESSURE = [
  [0, 0],
  [5, 20],
  [20, 45],
  [50, 70],
  [150, 90],
  [400, 100],
] as const;
const COMPETITOR_PRESSURE = [
  [0, 0],
  [1, 15],
  [3, 35],
  [6, 60],
  [10, 80],
  [20, 100],
] as const;
const AMAZON_REVIEW_PRESSURE = [
  [0, 0],
  [100, 20],
  [1000, 45],
  [5000, 70],
  [20000, 90],
  [50000, 100],
] as const;
const YT_VIDEO_PRESSURE = [
  [0, 0],
  [5, 20],
  [15, 45],
  [30, 70],
  [50, 90],
] as const;

function competitionComponent(input: ScoringInput): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "competition" as const, label: COMPONENT_LABELS.competition };
  const c = input.competition;
  const pressures: Array<{ name: string; pressure: number; reliability: number; at: string | null }> = [];
  if (c.metaActiveAds)
    pressures.push({ name: `Meta active ads (${c.metaActiveAds.value})`, pressure: piecewise(c.metaActiveAds.value, ADS_PRESSURE), reliability: c.metaActiveAds.reliability, at: c.metaActiveAds.observedAt });
  if (c.trackedCompetitors > 0)
    pressures.push({ name: `Tracked competitors (${c.trackedCompetitors})`, pressure: piecewise(c.trackedCompetitors, COMPETITOR_PRESSURE), reliability: 0.7, at: c.competitorsLatestAt });
  if (c.amazonTopReviewCount)
    pressures.push({ name: `Amazon top-listing reviews (${c.amazonTopReviewCount.value})`, pressure: piecewise(c.amazonTopReviewCount.value, AMAZON_REVIEW_PRESSURE), reliability: c.amazonTopReviewCount.reliability, at: c.amazonTopReviewCount.observedAt });
  if (c.youtubeRecentVideos)
    pressures.push({ name: `Recent YouTube Shorts in sample (${c.youtubeRecentVideos.value})`, pressure: piecewise(c.youtubeRecentVideos.value, YT_VIDEO_PRESSURE), reliability: c.youtubeRecentVideos.reliability, at: c.youtubeRecentVideos.observedAt });

  if (pressures.length === 0) {
    return { ...base, score: null, reliability: null, latestAt: null, basis: "none", inputs: {}, explanation: ["No competition indicators recorded."] };
  }
  const pressure = mean(pressures.map((p) => p.pressure))!;
  let score = 100 - pressure;
  const explanation = pressures.map((p) => `${p.name} → pressure ${round(p.pressure, 1)}`);
  const adsDir = indicatorDirection(c.metaAdsHistory);
  if (adsDir === "rising") {
    score -= 5;
    explanation.push("Active ad count is rising over time: −5.");
  }
  const dates = pressures.map((p) => p.at).filter((x): x is string => !!x).sort();
  return {
    ...base,
    score: round(clamp(score), 1),
    reliability: round(mean(pressures.map((p) => p.reliability))!, 2),
    latestAt: dates.at(-1) ?? null,
    basis: pressures.length > 1 ? "mixed" : "measured",
    inputs: { indicators: pressures.length, meanPressure: round(pressure, 1), adsDirection: adsDir ?? "unknown" },
    explanation: [`Score = 100 − mean competition pressure (${round(pressure, 1)}).`, ...explanation],
  };
}

function problemComponent(input: ScoringInput): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "problem" as const, label: COMPONENT_LABELS.problem };
  const a = input.assessments.problem;
  if (!a) return { ...base, score: null, reliability: null, latestAt: null, basis: "none", inputs: {}, explanation: ["No problem-value assessment yet."] };
  const { severity, frequency, clarity } = a.ratings;
  const raw = ((severity + frequency + clarity) / 15) * 100;
  return {
    ...base,
    score: round(raw, 1),
    reliability: a.assessedBy === "ai" ? AI_ASSESSMENT_RELIABILITY : USER_ASSESSMENT_RELIABILITY,
    latestAt: a.at,
    basis: a.assessedBy === "ai" ? "assessment_ai" : "assessment_user",
    inputs: { severity, frequency, clarity, assessedBy: a.assessedBy },
    explanation: [`(severity ${severity} + frequency ${frequency} + clarity ${clarity}) / 15.`],
  };
}

const TREND_LONGEVITY: Record<TrendClass, number | null> = {
  stable: 75,
  emerging: 65,
  rapidly_rising: 55,
  seasonal: 50,
  saturating: 35,
  declining: 15,
  insufficient_data: null,
};

function longevityComponent(input: ScoringInput, trend: TrendAnalysis): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "longevity" as const, label: COMPONENT_LABELS.longevity };
  const parts: number[] = [];
  const explanation: string[] = [];
  const rel: number[] = [];
  let basis: ComponentResult["basis"] = "none";
  const trendPart = TREND_LONGEVITY[trend.classification];
  // Only a long series says something about longevity.
  if (trendPart !== null && trend.spanDays >= 180) {
    parts.push(trendPart);
    rel.push(input.search?.reliability ?? 0.5);
    explanation.push(`Trend classification “${trend.classification}” over ${trend.spanDays} days → ${trendPart}.`);
    basis = "measured";
  }
  const a = input.assessments.longevity;
  if (a) {
    const v = ((a.ratings.evergreen * 0.7 + a.ratings.repeatPurchase * 0.3) / 5) * 100;
    parts.push(v);
    rel.push(a.assessedBy === "ai" ? AI_ASSESSMENT_RELIABILITY : USER_ASSESSMENT_RELIABILITY);
    explanation.push(`Assessment: evergreen ${a.ratings.evergreen}/5, repeat purchase ${a.ratings.repeatPurchase}/5 → ${round(v, 1)}.`);
    basis = basis === "measured" ? "mixed" : a.assessedBy === "ai" ? "assessment_ai" : "assessment_user";
  }
  if (parts.length === 0)
    return { ...base, score: null, reliability: null, latestAt: null, basis: "none", inputs: {}, explanation: ["Needs ≥180 days of trend data or a longevity assessment."] };
  return {
    ...base,
    score: round(mean(parts)!, 1),
    reliability: round(mean(rel)!, 2),
    latestAt: a?.at ?? input.search?.points.at(-1)?.date ?? null,
    basis,
    inputs: { trendPart, assessment: a ? "yes" : "no" },
    explanation,
  };
}

const WEIGHT_CURVE = [
  [250, 100],
  [500, 85],
  [1000, 65],
  [2000, 40],
  [5000, 10],
] as const;
const SHIP_DAYS_CURVE = [
  [7, 100],
  [10, 80],
  [15, 55],
  [20, 35],
  [30, 10],
] as const;
const SHIP_COST_RATIO_CURVE = [
  [0, 100],
  [0.1, 85],
  [0.2, 60],
  [0.35, 30],
  [0.5, 0],
] as const;

function shippingComponent(input: ScoringInput): Omit<ComponentResult, "weight" | "effectiveScore"> {
  const base = { key: "shipping" as const, label: COMPONENT_LABELS.shipping };
  const s = input.shipping;
  const parts: number[] = [];
  const explanation: string[] = [];
  if (s.weightGrams !== null) {
    const v = piecewise(s.weightGrams, WEIGHT_CURVE);
    parts.push(v);
    explanation.push(`Weight ${s.weightGrams} g → ${round(v, 1)}.`);
  }
  if (s.shipDaysMax !== null) {
    const v = piecewise(s.shipDaysMax, SHIP_DAYS_CURVE);
    parts.push(v);
    explanation.push(`Max delivery ${s.shipDaysMax} days → ${round(v, 1)}.`);
  }
  if (s.shippingCost !== null && s.sellingPrice) {
    const ratio = s.shippingCost / s.sellingPrice;
    const v = piecewise(ratio, SHIP_COST_RATIO_CURVE);
    parts.push(v);
    explanation.push(`Shipping is ${round(ratio * 100, 1)}% of price → ${round(v, 1)}.`);
  }
  if (parts.length === 0)
    return { ...base, score: null, reliability: null, latestAt: null, basis: "none", inputs: {}, explanation: ["No weight, delivery time or shipping cost recorded."] };
  let score = mean(parts)!;
  if (s.isFragile) {
    score -= 20;
    explanation.push("Fragile: −20.");
  }
  return {
    ...base,
    score: round(clamp(score), 1),
    reliability: s.reliability,
    latestAt: s.latestAt,
    basis: "manual",
    inputs: { weightGrams: s.weightGrams, shipDaysMax: s.shipDaysMax, shippingCost: s.shippingCost, isFragile: s.isFragile },
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export function freshnessFactor(latestAt: string | null, now: Date, kind: "observation" | "assessment"): number {
  if (!latestAt) return 0;
  const age = daysBetween(latestAt, now);
  if (kind === "assessment") return age <= 90 ? 1 : age <= 180 ? 0.7 : 0.5;
  if (age <= 7) return 1;
  if (age <= 14) return 0.9;
  if (age <= 30) return 0.75;
  if (age <= 60) return 0.55;
  if (age <= 120) return 0.35;
  return 0.15;
}

function sampleSizeFactor(points: number): number {
  if (points >= 52) return 1;
  if (points >= 26) return 0.85;
  if (points >= 12) return 0.65;
  if (points >= 8) return 0.45;
  if (points > 0) return 0.2;
  return 0;
}

/** Direction (+1/−1/0) of a series using first-half vs second-half means. */
function seriesDirection(points: SeriesPoint[]): -1 | 0 | 1 | null {
  if (points.length < 4) return null;
  const half = Math.floor(points.length / 2);
  const a = mean(points.slice(0, half).map((p) => p.value))!;
  const b = mean(points.slice(half).map((p) => p.value))!;
  if (a === 0) return b > 0 ? 1 : 0;
  const pct = ((b - a) / a) * 100;
  return pct > 10 ? 1 : pct < -10 ? -1 : 0;
}

function agreementFactor(input: ScoringInput, trend: TrendAnalysis): { value: number; note: string } {
  const dirs: number[] = [];
  if (trend.sufficient && trend.growthPct !== null) dirs.push(trend.growthPct > 10 ? 1 : trend.growthPct < -10 ? -1 : 0);
  for (const s of input.socialSeries) {
    const d = seriesDirection(s.points);
    if (d !== null) dirs.push(d);
  }
  if (dirs.length < 2) return { value: 0.6, note: "Only one independent demand signal; agreement cannot be assessed." };
  const allSame = dirs.every((d) => d === dirs[0]);
  if (allSame) return { value: 1, note: `${dirs.length} independent demand signals agree.` };
  const opposite = dirs.includes(1) && dirs.includes(-1);
  return opposite
    ? { value: 0.3, note: "Independent demand signals point in opposite directions." }
    : { value: 0.65, note: "Independent demand signals partially agree." };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeScore(input: ScoringInput, weights: ScoringWeights): ScoreResult {
  const adsDir = indicatorDirection(input.competition.metaAdsHistory);
  const trend = analyzeTrend(input.search?.points ?? [], { competitionTrend: adsDir });

  const profit = profitComponent(input);
  const rawComponents = [
    demandComponent(input, trend),
    contentComponent(input),
    profit,
    competitionComponent(input),
    problemComponent(input),
    longevityComponent(input, trend),
    shippingComponent(input),
  ];
  const components: ComponentResult[] = rawComponents.map((c) => {
    // strip helper-only fields
    const { missingNotes: _m, ...rest } = c as typeof c & { missingNotes?: string[] };
    return {
      ...rest,
      weight: weights[c.key],
      effectiveScore: c.score ?? MISSING_COMPONENT_SCORE,
    };
  });

  const totalWeight = COMPONENT_KEYS.reduce((a, k) => a + weights[k], 0) || 1;
  const total = components.reduce((acc, c) => acc + c.effectiveScore * c.weight, 0) / totalWeight;

  const missing = components.filter((c) => c.score === null).map((c) => c.label);
  missing.push(...profit.missingNotes);

  // Confidence
  const present = components.filter((c) => c.score !== null && c.weight > 0);
  const completeness = present.reduce((a, c) => a + c.weight, 0) / totalWeight;
  const presentWeight = present.reduce((a, c) => a + c.weight, 0) || 1;
  const reliability = present.length
    ? present.reduce((a, c) => a + (c.reliability ?? 0) * c.weight, 0) / presentWeight
    : 0;
  const freshness = present.length
    ? present.reduce((a, c) => {
        const kind = c.basis.startsWith("assessment") ? "assessment" : "observation";
        return a + freshnessFactor(c.latestAt, input.now, kind) * c.weight;
      }, 0) / presentWeight
    : 0;
  const agreement = agreementFactor(input, trend);
  const sampleSize = sampleSizeFactor(input.search?.points.length ?? 0);
  const breakdown: ConfidenceBreakdown = {
    completeness: round(completeness, 3),
    reliability: round(reliability, 3),
    freshness: round(freshness, 3),
    agreement: round(agreement.value, 3),
    sampleSize: round(sampleSize, 3),
  };
  const confidence =
    100 *
    (CONFIDENCE_WEIGHTS.completeness * completeness +
      CONFIDENCE_WEIGHTS.reliability * reliability +
      CONFIDENCE_WEIGHTS.freshness * freshness +
      CONFIDENCE_WEIGHTS.agreement * agreement.value +
      CONFIDENCE_WEIGHTS.sampleSize * sampleSize);

  const { recommendation, reasons } = recommend(round(total, 1), round(confidence, 1), completeness, components);
  reasons.push(agreement.note);

  return {
    formulaVersion: FORMULA_VERSION,
    total: round(total, 1),
    confidence: round(confidence, 1),
    confidenceBreakdown: breakdown,
    recommendation,
    reasons,
    components,
    missing,
    trend,
    weights,
    isDemo: Boolean(input.search?.isDemo),
  };
}

export const RECOMMENDATION_RULES = {
  minCompleteness: 0.5,
  minConfidence: 35,
  weakProfitBelow: 35,
  tooCompetitiveBelow: 25,
  strongTotal: 72,
  strongConfidence: 55,
  investigateTotal: 58,
  monitorDemand: 60,
} as const;

export function recommend(
  total: number,
  confidence: number,
  completeness: number,
  components: ComponentResult[],
): { recommendation: Recommendation; reasons: string[] } {
  const r = RECOMMENDATION_RULES;
  const get = (k: ComponentKey) => components.find((c) => c.key === k)?.score ?? null;
  const profit = get("profit");
  const competition = get("competition");
  const demand = get("demand");
  if (completeness < r.minCompleteness || confidence < r.minConfidence) {
    return {
      recommendation: "insufficient_evidence",
      reasons: [
        `Data covers ${Math.round(completeness * 100)}% of the scoring weight and confidence is ${confidence} (need ≥${r.minCompleteness * 100}% and ≥${r.minConfidence}).`,
      ],
    };
  }
  if (profit !== null && profit < r.weakProfitBelow)
    return { recommendation: "weak_profit", reasons: [`Profit potential ${profit} is below ${r.weakProfitBelow}.`] };
  if (competition !== null && competition < r.tooCompetitiveBelow)
    return { recommendation: "too_competitive", reasons: [`Competition score ${competition} is below ${r.tooCompetitiveBelow} (heavy competition).`] };
  if (total >= r.strongTotal && confidence >= r.strongConfidence)
    return { recommendation: "strong_candidate", reasons: [`Opportunity ${total} ≥ ${r.strongTotal} with confidence ${confidence} ≥ ${r.strongConfidence}.`] };
  if (total >= r.investigateTotal)
    return { recommendation: "worth_investigating", reasons: [`Opportunity ${total} ≥ ${r.investigateTotal}.`] };
  if (demand !== null && demand >= r.monitorDemand)
    return { recommendation: "monitor", reasons: [`Overall score ${total} is modest but demand growth (${demand}) is strong.`] };
  return { recommendation: "avoid_for_now", reasons: [`Opportunity ${total} is below ${r.investigateTotal} without strong demand growth.`] };
}
