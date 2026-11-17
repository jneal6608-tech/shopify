/**
 * Product-test validation metrics. Separates ATTENTION metrics (views,
 * engagement) from PURCHASE metrics (clicks, sessions, carts, orders) and
 * refuses to call a winner without enough purchasing evidence.
 */
import { round } from "./math";

export interface VideoSnapshot {
  videoId: string;
  platform: string;
  hook: string;
  format: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
}

export interface SalesTotals {
  sessions: number | null;
  addToCarts: number | null;
  orders: number;
  revenue: number;
  refundCount: number;
  refundsAmount: number;
  adSpend: number;
}

export const EVIDENCE_THRESHOLDS = {
  minVideosForContentConclusions: 3,
  minViewsForAttention: 5000,
  minViewsPerVideoForRanking: 300,
  minClicksForIntent: 100,
  minSessionsForConversion: 150,
  minOrdersForPurchase: 5,
  goodEngagementRate: 0.06,
  goodClickThroughRate: 0.004,
  goodConversionRate: 0.015,
} as const;

export interface VideoMetrics extends VideoSnapshot {
  engagementRate: number | null;
  clickThroughRate: number | null;
  profileVisitRate: number | null;
}

export function videoMetrics(v: VideoSnapshot): VideoMetrics {
  const eng = v.likes + v.comments + v.shares + v.saves;
  return {
    ...v,
    engagementRate: v.views > 0 ? eng / v.views : null,
    clickThroughRate: v.views > 0 ? v.linkClicks / v.views : null,
    profileVisitRate: v.views > 0 ? v.profileVisits / v.views : null,
  };
}

export type ValidationVerdict =
  | "insufficient_evidence"
  | "weak_attention"
  | "attention_without_intent"
  | "intent_without_conversion"
  | "converting"
  | "converting_unprofitably";

export const VERDICT_LABELS: Record<ValidationVerdict, string> = {
  insufficient_evidence: "Insufficient evidence — keep testing",
  weak_attention: "Weak attention",
  attention_without_intent: "Attention without purchase intent",
  intent_without_conversion: "Purchase intent, but visitors aren't converting",
  converting: "Converting — evidence of real demand",
  converting_unprofitably: "Converting, but not profitably",
};

export type NextAction = "continue_testing" | "increase_effort" | "iterate_content" | "fix_store_page" | "pause" | "discontinue";

export interface ValidationResult {
  attention: {
    videos: number;
    totalViews: number;
    avgEngagementRate: number | null;
    sufficient: boolean;
  };
  intent: {
    totalClicks: number;
    totalProfileVisits: number;
    clickThroughRate: number | null;
    sufficient: boolean;
  };
  purchase: {
    sessions: number | null;
    addToCarts: number | null;
    orders: number;
    revenue: number;
    refundRate: number | null;
    conversionRate: number | null;
    addToCartRate: number | null;
    averageOrderValue: number | null;
    contributionEstimate: number | null;
    sufficient: boolean;
  };
  verdict: ValidationVerdict;
  nextAction: NextAction;
  reasons: string[];
  bestByEngagement: VideoMetrics[];
  bestByClicks: VideoMetrics[];
  formatPerformance: Array<{ format: string; videos: number; views: number; avgEngagementRate: number | null; clickThroughRate: number | null }>;
  missingData: string[];
}

export function analyzeValidation(
  videos: VideoSnapshot[],
  sales: SalesTotals,
  unitContribution: number | null,
): ValidationResult {
  const t = EVIDENCE_THRESHOLDS;
  const vm = videos.map(videoMetrics);
  const totalViews = vm.reduce((a, v) => a + v.views, 0);
  const totalClicks = vm.reduce((a, v) => a + v.linkClicks, 0);
  const totalProfile = vm.reduce((a, v) => a + v.profileVisits, 0);
  const totalEng = vm.reduce((a, v) => a + v.likes + v.comments + v.shares + v.saves, 0);
  const avgEng = totalViews > 0 ? totalEng / totalViews : null;
  const ctr = totalViews > 0 ? totalClicks / totalViews : null;

  const attentionSufficient = vm.length >= t.minVideosForContentConclusions && totalViews >= t.minViewsForAttention;
  const intentSufficient = totalClicks >= t.minClicksForIntent || (sales.sessions ?? 0) >= t.minClicksForIntent;
  const conv = sales.sessions && sales.sessions > 0 ? sales.orders / sales.sessions : null;
  const atc = sales.sessions && sales.sessions > 0 && sales.addToCarts !== null ? sales.addToCarts / sales.sessions : null;
  const purchaseSufficient = (sales.sessions ?? 0) >= t.minSessionsForConversion || sales.orders >= t.minOrdersForPurchase;
  const refundRate = sales.orders > 0 ? sales.refundCount / sales.orders : null;
  const contribution =
    unitContribution !== null ? round(unitContribution * (sales.orders - sales.refundCount) - sales.adSpend, 2) : null;

  const missingData: string[] = [];
  if (sales.sessions === null) missingData.push("Website sessions (from Shopify Analytics) — needed for conversion rate");
  if (sales.addToCarts === null) missingData.push("Add-to-cart count");
  if (vm.length === 0) missingData.push("Published videos and their metrics");
  if (unitContribution === null) missingData.push("Unit economics (price and costs) for profitability");

  const reasons: string[] = [];
  let verdict: ValidationVerdict;
  let nextAction: NextAction;

  if (!attentionSufficient && !purchaseSufficient) {
    verdict = "insufficient_evidence";
    nextAction = "continue_testing";
    reasons.push(
      `Need ≥${t.minVideosForContentConclusions} videos and ≥${t.minViewsForAttention.toLocaleString()} total views (have ${vm.length} videos, ${totalViews.toLocaleString()} views) before judging attention.`,
    );
  } else if (purchaseSufficient) {
    if (sales.orders >= t.minOrdersForPurchase && (conv === null || conv >= t.goodConversionRate * 0.6)) {
      if (contribution !== null && contribution <= 0) {
        verdict = "converting_unprofitably";
        nextAction = "iterate_content";
        reasons.push(`${sales.orders} orders, but estimated contribution after ad spend is $${contribution}. Revisit pricing or costs.`);
      } else {
        verdict = "converting";
        nextAction = "increase_effort";
        reasons.push(`${sales.orders} orders${conv !== null ? ` at ${round(conv * 100, 2)}% conversion` : ""} — real purchasing behaviour, not just views.`);
      }
    } else {
      verdict = "intent_without_conversion";
      nextAction = "fix_store_page";
      reasons.push(
        `${sales.sessions ?? 0} sessions produced ${sales.orders} orders${conv !== null ? ` (${round(conv * 100, 2)}%)` : ""}. Traffic arrives but does not buy — check price, product page, trust and shipping info.`,
      );
    }
  } else if (avgEng !== null && avgEng < t.goodEngagementRate / 2 && (ctr ?? 0) < t.goodClickThroughRate / 2) {
    verdict = "weak_attention";
    nextAction = vm.length >= 8 ? "discontinue" : "iterate_content";
    reasons.push(
      `Engagement ${round((avgEng ?? 0) * 100, 2)}% and click-through ${round((ctr ?? 0) * 100, 3)}% are well below benchmarks across ${vm.length} videos.`,
    );
  } else if (!intentSufficient || (ctr ?? 0) < t.goodClickThroughRate) {
    verdict = "attention_without_intent";
    nextAction = "iterate_content";
    reasons.push(
      `${totalViews.toLocaleString()} views but only ${totalClicks} link clicks (${round((ctr ?? 0) * 100, 3)}% CTR). Views alone do not show buying intent — test hooks that lead with the product's use and price.`,
    );
  } else {
    verdict = "insufficient_evidence";
    nextAction = "continue_testing";
    reasons.push(`Click-through is promising (${round((ctr ?? 0) * 100, 3)}%) but there are not yet enough sessions/orders to judge conversion.`);
  }

  if (refundRate !== null && sales.orders >= t.minOrdersForPurchase && refundRate > 0.1)
    reasons.push(`Refund rate is ${round(refundRate * 100, 1)}% — investigate product quality or expectations set by the content.`);

  const rankable = vm.filter((v) => v.views >= t.minViewsPerVideoForRanking);
  const bestByEngagement = [...rankable].sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0)).slice(0, 3);
  const bestByClicks = [...rankable].sort((a, b) => (b.clickThroughRate ?? 0) - (a.clickThroughRate ?? 0)).slice(0, 3);

  const byFormat = new Map<string, VideoMetrics[]>();
  for (const v of vm) byFormat.set(v.format || "unspecified", [...(byFormat.get(v.format || "unspecified") ?? []), v]);
  const formatPerformance = [...byFormat.entries()].map(([format, list]) => {
    const views = list.reduce((a, v) => a + v.views, 0);
    const eng = list.reduce((a, v) => a + v.likes + v.comments + v.shares + v.saves, 0);
    const clicks = list.reduce((a, v) => a + v.linkClicks, 0);
    return {
      format,
      videos: list.length,
      views,
      avgEngagementRate: views > 0 ? round(eng / views, 4) : null,
      clickThroughRate: views > 0 ? round(clicks / views, 5) : null,
    };
  });

  return {
    attention: { videos: vm.length, totalViews, avgEngagementRate: avgEng === null ? null : round(avgEng, 4), sufficient: attentionSufficient },
    intent: { totalClicks, totalProfileVisits: totalProfile, clickThroughRate: ctr === null ? null : round(ctr, 5), sufficient: intentSufficient },
    purchase: {
      sessions: sales.sessions,
      addToCarts: sales.addToCarts,
      orders: sales.orders,
      revenue: round(sales.revenue, 2),
      refundRate: refundRate === null ? null : round(refundRate, 4),
      conversionRate: conv === null ? null : round(conv, 4),
      addToCartRate: atc === null ? null : round(atc, 4),
      averageOrderValue: sales.orders > 0 ? round(sales.revenue / sales.orders, 2) : null,
      contributionEstimate: contribution,
      sufficient: purchaseSufficient,
    },
    verdict,
    nextAction,
    reasons,
    bestByEngagement,
    bestByClicks,
    formatPerformance,
    missingData,
  };
}

// ---------------------------------------------------------------------------
// Testing priority planner
// ---------------------------------------------------------------------------

export interface PriorityCandidate {
  productId: string;
  name: string;
  stage: string;
  opportunity: number | null;
  confidence: number | null;
  sampleCost: number | null;
  verdict: ValidationVerdict | null;
}

export interface PriorityPlan {
  maxConcurrent: number;
  hoursPerProductPerWeek: number;
  ranked: Array<PriorityCandidate & { priority: number; action: "continue" | "start" | "wait" | "stop"; reason: string }>;
  notes: string[];
}

const ACTIVE_STAGES = new Set(["sample_ordered", "sample_received", "content_production", "testing", "promising", "scaling_consideration"]);
export const HOURS_PER_TEST_PER_WEEK = 4;
export const DEFAULT_SAMPLE_COST = 25;

export function planTestingPriorities(
  candidates: PriorityCandidate[],
  budgetUsd: number | null,
  hoursPerWeek: number | null,
): PriorityPlan {
  const notes: string[] = [];
  const hours = hoursPerWeek ?? 8;
  if (hoursPerWeek === null) notes.push("Weekly hours not set in Settings — assuming 8 h/week.");
  const byTime = Math.max(1, Math.floor(hours / HOURS_PER_TEST_PER_WEEK));
  const avgSample =
    candidates.filter((c) => c.sampleCost !== null).reduce((a, c) => a + (c.sampleCost ?? 0), 0) /
      Math.max(1, candidates.filter((c) => c.sampleCost !== null).length) || DEFAULT_SAMPLE_COST;
  const byBudget = budgetUsd === null ? byTime : Math.max(0, Math.floor(budgetUsd / avgSample));
  if (budgetUsd === null) notes.push("Testing budget not set — capacity is limited by time only.");
  const maxConcurrent = Math.min(byTime, byBudget);
  notes.push(`Capacity: ${maxConcurrent} concurrent test(s) (time allows ${byTime} at ~${HOURS_PER_TEST_PER_WEEK} h/week each; budget allows ${byBudget}).`);

  const scored = candidates.map((c) => {
    const opp = c.opportunity ?? 0;
    const conf = (c.confidence ?? 0) / 100;
    let priority = opp * (0.5 + 0.5 * conf);
    const active = ACTIVE_STAGES.has(c.stage);
    if (c.verdict === "converting") priority += 40;
    if (c.verdict === "intent_without_conversion") priority += 10;
    if (c.verdict === "weak_attention") priority -= 30;
    if (c.verdict === "converting_unprofitably") priority -= 10;
    if (active) priority += 10; // sunk effort: finishing a test is cheaper than starting one
    return { ...c, priority: round(priority, 1), active };
  });
  scored.sort((a, b) => b.priority - a.priority);

  let slots = maxConcurrent;
  const ranked = scored.map((c) => {
    if (c.verdict === "weak_attention" && c.active) {
      return { ...c, action: "stop" as const, reason: "Weak attention after testing — free the slot for a stronger candidate." };
    }
    if (slots > 0) {
      slots--;
      return {
        ...c,
        action: c.active ? ("continue" as const) : ("start" as const),
        reason: c.active ? "Keep testing: within capacity and ranked highly." : `Start: opportunity ${c.opportunity ?? "n/a"}, confidence ${c.confidence ?? "n/a"}.`,
      };
    }
    return { ...c, action: "wait" as const, reason: "Over current time/budget capacity." };
  });
  return { maxConcurrent, hoursPerProductPerWeek: HOURS_PER_TEST_PER_WEEK, ranked: ranked.map(({ active: _a, ...r }) => r), notes };
}
