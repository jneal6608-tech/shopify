import { describe, expect, it } from "vitest";
import { analyzeValidation, planTestingPriorities, type VideoSnapshot } from "@/lib/analytics/validation";

const vid = (id: string, views: number, clicks: number, format = "problem_solution", eng = 0.08): VideoSnapshot => ({
  videoId: id, platform: "tiktok", hook: `hook ${id}`, format, title: id,
  views, likes: Math.round(views * eng), comments: 0, shares: 0, saves: 0, profileVisits: Math.round(views * 0.01), linkClicks: clicks,
});
const noSales = { sessions: null, addToCarts: null, orders: 0, revenue: 0, refundCount: 0, refundsAmount: 0, adSpend: 0 };

describe("analyzeValidation", () => {
  it("requires more evidence before judging", () => {
    const r = analyzeValidation([vid("a", 900, 2)], noSales, 12);
    expect(r.verdict).toBe("insufficient_evidence");
    expect(r.nextAction).toBe("continue_testing");
    expect(r.missingData.join(" ")).toMatch(/sessions/i);
  });

  it("does not declare a winner from views alone", () => {
    const r = analyzeValidation([vid("a", 200000, 30), vid("b", 150000, 20), vid("c", 90000, 10)], noSales, 12);
    expect(r.verdict).toBe("attention_without_intent");
    expect(r.verdict).not.toBe("converting");
  });

  it("detects traffic that does not convert", () => {
    const r = analyzeValidation(
      [vid("a", 50000, 400), vid("b", 40000, 300), vid("c", 30000, 200)],
      { ...noSales, sessions: 800, addToCarts: 20, orders: 1, revenue: 30 },
      12,
    );
    expect(r.verdict).toBe("intent_without_conversion");
    expect(r.nextAction).toBe("fix_store_page");
  });

  it("recognises real purchasing behaviour", () => {
    const r = analyzeValidation(
      [vid("a", 50000, 400), vid("b", 40000, 300), vid("c", 30000, 200, "satisfying")],
      { ...noSales, sessions: 900, addToCarts: 60, orders: 18, revenue: 630 },
      12,
    );
    expect(r.verdict).toBe("converting");
    expect(r.purchase.conversionRate).toBeCloseTo(0.02, 3);
    expect(r.purchase.averageOrderValue).toBe(35);
    expect(r.formatPerformance.length).toBe(2);
    expect(r.bestByClicks[0].videoId).toBe("a");
  });

  it("flags unprofitable conversion", () => {
    const r = analyzeValidation(
      [vid("a", 50000, 400), vid("b", 40000, 300), vid("c", 30000, 200)],
      { ...noSales, sessions: 900, addToCarts: 60, orders: 18, revenue: 630, adSpend: 1000 },
      12,
    );
    expect(r.verdict).toBe("converting_unprofitably");
  });
});

describe("planTestingPriorities", () => {
  it("respects time and budget capacity", () => {
    const plan = planTestingPriorities(
      [
        { productId: "1", name: "A", stage: "researching", opportunity: 80, confidence: 70, sampleCost: 20, verdict: null },
        { productId: "2", name: "B", stage: "researching", opportunity: 60, confidence: 70, sampleCost: 20, verdict: null },
        { productId: "3", name: "C", stage: "testing", opportunity: 55, confidence: 60, sampleCost: 20, verdict: "converting" },
      ],
      40,
      8,
    );
    expect(plan.maxConcurrent).toBe(2);
    expect(plan.ranked[0].productId).toBe("3");
    expect(plan.ranked[0].action).toBe("continue");
    expect(plan.ranked.filter((r) => r.action === "wait").length).toBe(1);
  });
});
