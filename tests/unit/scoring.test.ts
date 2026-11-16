import { describe, expect, it } from "vitest";
import {
  computeScore,
  MISSING_COMPONENT_SCORE,
  type ScoringInput,
} from "@/lib/analytics/scoring";
import { DEFAULT_WEIGHTS, weightsSchema } from "@/lib/analytics/weights";
import { weekly } from "../helpers/series";

const now = new Date("2026-11-16T00:00:00Z");

function emptyInput(): ScoringInput {
  return {
    now,
    search: null,
    socialSeries: [],
    competition: {
      metaActiveAds: null,
      metaAdsHistory: [],
      youtubeRecentVideos: null,
      amazonTopReviewCount: null,
      trackedCompetitors: 0,
      competitorsLatestAt: null,
    },
    economics: { sellingPrice: null, supplierCost: null, shippingCost: null, reliability: 0.6, latestAt: null },
    assessments: { content: null, problem: null, longevity: null },
    shipping: { weightGrams: null, isFragile: null, shipDaysMax: null, shippingCost: null, sellingPrice: null, reliability: 0.6, latestAt: null },
  };
}

function richInput(): ScoringInput {
  const i = emptyInput();
  i.search = {
    points: weekly(52, (n) => (n < 39 ? 20 : 45), new Date("2026-11-15T00:00:00Z")),
    sourceKey: "google_trends_serpapi",
    reliability: 0.85,
    isDemo: false,
  };
  i.socialSeries = [{ metric: "youtube_recent_videos", points: weekly(6, (n) => 5 + n * 3) }];
  i.competition.metaActiveAds = { value: 8, observedAt: "2026-11-14T00:00:00Z", sourceKey: "meta_ad_library", reliability: 0.7, isEstimate: false, isDemo: false };
  i.competition.trackedCompetitors = 2;
  i.competition.competitorsLatestAt = "2026-11-10T00:00:00Z";
  i.economics = { sellingPrice: 34.99, supplierCost: 7.5, shippingCost: 3.5, reliability: 0.75, latestAt: "2026-11-12T00:00:00Z" };
  const at = "2026-11-10T00:00:00Z";
  i.assessments.content = {
    assessedBy: "user",
    at,
    ratings: { closeup_demo: 3, problem_solution: 3, before_after: 2, satisfying: 3, comparison: 2, educational: 2, curiosity: 2, text_overlay: 3, voiceover: 2, cinematic: 2, unboxing: 1, customer_use: 2 },
  };
  i.assessments.problem = { assessedBy: "user", at, ratings: { severity: 4, frequency: 4, clarity: 5 } };
  i.assessments.longevity = { assessedBy: "user", at, ratings: { evergreen: 4, repeatPurchase: 2 } };
  i.shipping = { weightGrams: 300, isFragile: false, shipDaysMax: 9, shippingCost: 3.5, sellingPrice: 34.99, reliability: 0.75, latestAt: at };
  return i;
}

describe("computeScore", () => {
  it("never rewards missing data", () => {
    const r = computeScore(emptyInput(), DEFAULT_WEIGHTS);
    expect(r.total).toBe(MISSING_COMPONENT_SCORE);
    expect(r.recommendation).toBe("insufficient_evidence");
    expect(r.missing.length).toBeGreaterThanOrEqual(7);
    expect(r.confidence).toBeLessThan(20);
    expect(r.components.every((c) => c.score === null)).toBe(true);
  });

  it("adding real data can only move a missing component off the penalty floor", () => {
    const empty = computeScore(emptyInput(), DEFAULT_WEIGHTS);
    const i = emptyInput();
    i.economics = { sellingPrice: 5, supplierCost: 4.5, shippingCost: 3, reliability: 0.6, latestAt: now.toISOString() };
    const bad = computeScore(i, DEFAULT_WEIGHTS);
    const profit = bad.components.find((c) => c.key === "profit")!;
    expect(profit.score).toBe(0); // terrible economics score lower than "missing"
    expect(bad.total).toBeLessThan(empty.total);
  });

  it("scores a well-evidenced product highly with good confidence", () => {
    const r = computeScore(richInput(), DEFAULT_WEIGHTS);
    expect(r.trend.classification).toBe("rapidly_rising");
    expect(r.total).toBeGreaterThan(70);
    expect(r.confidence).toBeGreaterThan(60);
    expect(r.recommendation).toBe("strong_candidate");
    expect(r.missing).toEqual([]);
    for (const c of r.components) expect(c.explanation.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(computeScore(richInput(), DEFAULT_WEIGHTS)).toEqual(computeScore(richInput(), DEFAULT_WEIGHTS));
  });

  it("lowers confidence for AI-assessed rubrics vs user-assessed", () => {
    const user = computeScore(richInput(), DEFAULT_WEIGHTS);
    const ai = richInput();
    ai.assessments.content!.assessedBy = "ai";
    ai.assessments.problem!.assessedBy = "ai";
    const r = computeScore(ai, DEFAULT_WEIGHTS);
    expect(r.total).toBe(user.total);
    expect(r.confidence).toBeLessThan(user.confidence);
  });

  it("lowers confidence for stale data", () => {
    const fresh = computeScore(richInput(), DEFAULT_WEIGHTS);
    const stale = richInput();
    stale.now = new Date("2027-06-01T00:00:00Z");
    expect(computeScore(stale, DEFAULT_WEIGHTS).confidence).toBeLessThan(fresh.confidence);
  });

  it("flags heavy competition", () => {
    const i = richInput();
    i.competition.metaActiveAds!.value = 500;
    i.competition.trackedCompetitors = 25;
    i.competition.amazonTopReviewCount = { value: 60000, observedAt: "2026-11-14T00:00:00Z", sourceKey: "amazon_manual", reliability: 0.65, isEstimate: false, isDemo: false };
    expect(computeScore(i, DEFAULT_WEIGHTS).recommendation).toBe("too_competitive");
  });

  it("flags weak profit", () => {
    const i = richInput();
    i.economics.sellingPrice = 14;
    i.economics.supplierCost = 9;
    expect(computeScore(i, DEFAULT_WEIGHTS).recommendation).toBe("weak_profit");
  });

  it("assumes conservative shipping when unknown and lists it as missing", () => {
    const i = richInput();
    i.economics.shippingCost = null;
    const r = computeScore(i, DEFAULT_WEIGHTS);
    expect(r.missing.join(" ")).toMatch(/Shipping cost/);
    const profit = r.components.find((c) => c.key === "profit")!;
    expect(profit.inputs.shippingCost).toBe(6);
  });

  it("respects configurable weights", () => {
    const w = { demand: 0, content: 0, profit: 100, competition: 0, problem: 0, longevity: 0, shipping: 0 };
    const r = computeScore(richInput(), w);
    expect(r.total).toBe(r.components.find((c) => c.key === "profit")!.score);
  });

  it("reports source disagreement", () => {
    const i = richInput();
    i.socialSeries = [{ metric: "youtube_recent_videos", points: weekly(6, (n) => 30 - n * 5) }];
    const r = computeScore(i, DEFAULT_WEIGHTS);
    expect(r.confidenceBreakdown.agreement).toBeLessThan(0.5);
  });
});

describe("weightsSchema", () => {
  it("requires weights to sum to 100", () => {
    expect(weightsSchema.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, demand: 25 }).success).toBe(false);
  });
});
