import { describe, expect, it } from "vitest";
import { analyzeTrend, filterRange, indicatorDirection, windowChange } from "@/lib/analytics/trends";
import { weekly } from "../helpers/series";

describe("analyzeTrend", () => {
  it("reports insufficient data for short series", () => {
    const r = analyzeTrend(weekly(5, () => 50));
    expect(r.classification).toBe("insufficient_data");
    expect(r.sufficient).toBe(false);
    expect(r.growthPct).toBeNull();
  });

  it("classifies a flat series as stable", () => {
    const r = analyzeTrend(weekly(26, (i) => 50 + (i % 2)));
    expect(r.classification).toBe("stable");
    expect(Math.abs(r.growthPct!)).toBeLessThan(5);
  });

  it("classifies strong growth as rapidly rising", () => {
    const r = analyzeTrend(weekly(26, (i) => (i < 18 ? 10 : 40)));
    expect(r.classification).toBe("rapidly_rising");
    expect(r.growthPct!).toBeGreaterThanOrEqual(100);
  });

  it("classifies moderate growth as emerging", () => {
    const r = analyzeTrend(weekly(26, (i) => (i < 19 ? 40 : 55)));
    expect(r.classification).toBe("emerging");
  });

  it("classifies a falling series as declining", () => {
    const r = analyzeTrend(weekly(26, (i) => (i < 19 ? 60 : 30)));
    expect(r.classification).toBe("declining");
  });

  it("detects yearly seasonality", () => {
    // Peak every December/January for 3 years.
    const r = analyzeTrend(
      weekly(156, (i) => {
        const month = new Date(new Date("2026-11-15").getTime() - (155 - i) * 7 * 86_400_000).getUTCMonth();
        return month === 11 || month === 0 ? 90 : 20;
      }),
    );
    expect(r.seasonality.detected).toBe(true);
    expect(r.classification).toBe("seasonal");
    expect(r.seasonality.peakMonths).toContain(12);
  });

  it("only flags saturation when competition is rising", () => {
    const series = weekly(40, (i) => (i < 10 ? 20 + i * 8 : 100 - (i > 30 ? 2 : 0)));
    expect(analyzeTrend(series).classification).not.toBe("saturating");
    expect(analyzeTrend(series, { competitionTrend: "rising" }).classification).toBe("saturating");
  });
});

describe("windowChange", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  it("returns null without comparable data in both windows", () => {
    const r = windowChange(weekly(3, () => 10, now), "90d", now);
    expect(r.pct).toBeNull();
    expect(r.reason).toMatch(/Not enough comparable data/);
  });
  it("computes change across equal windows", () => {
    const s = weekly(26, (i) => (i < 13 ? 10 : 20), now);
    const r = windowChange(s, "90d", now);
    expect(r.pct).toBeGreaterThan(50);
  });
  it("has no comparison for all history", () => {
    expect(windowChange(weekly(30, () => 1, now), "all", now).pct).toBeNull();
  });
  it("filters ranges", () => {
    const s = weekly(60, () => 1, now);
    expect(filterRange(s, "30d", now).length).toBeLessThanOrEqual(5);
    expect(filterRange(s, "all", now).length).toBe(60);
  });
});

describe("indicatorDirection", () => {
  it("detects rising, falling, flat and unknown", () => {
    expect(indicatorDirection([])).toBeNull();
    expect(indicatorDirection(weekly(2, (i) => (i ? 30 : 10)))).toBe("rising");
    expect(indicatorDirection(weekly(2, (i) => (i ? 5 : 10)))).toBe("falling");
    expect(indicatorDirection(weekly(2, () => 10))).toBe("flat");
  });
});
