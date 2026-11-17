import { describe, expect, it } from "vitest";
import { compareOffers, type SupplierOfferInput } from "@/lib/analytics/suppliers";
import { evaluateAlerts } from "@/lib/analytics/alerts";
import { parseGoogleTrendsCsv } from "@/lib/sources/google-trends-csv";

const offer = (o: Partial<SupplierOfferInput>): SupplierOfferInput => ({
  offerId: "o", supplierId: "s", supplierName: "S", platform: "aliexpress", url: "https://x.example",
  storeRating: 4.8, storeReviewCount: 5000, yearsActive: 4, returnPolicy: "30-day returns",
  unitCost: 8, shippingCost: 3, shipDaysMin: 7, shipDaysMax: 12, moq: 1, variants: [],
  hasClearSpecs: true, productRating: 4.7, productReviewCount: 400, sampleQuality: null, ...o,
});

describe("supplier assessment", () => {
  it("never treats missing info as trustworthy", () => {
    const [a] = compareOffers([offer({ storeRating: null, storeReviewCount: null, returnPolicy: "", shipDaysMax: null, hasClearSpecs: null })]);
    expect(a.reliabilityScore).toBeLessThan(70);
    expect(a.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["no_store_rating", "no_return_policy", "no_shipping_estimate"]));
  });
  it("flags suspicious, inconsistent and poor-policy suppliers and ranks the reliable one first", () => {
    const r = compareOffers([
      offer({ offerId: "good" }),
      offer({ offerId: "sus", yearsActive: 0.3, unitCost: 3, returnPolicy: "No returns accepted", productRating: 3.9 }),
      offer({ offerId: "mid", unitCost: 9 }),
    ]);
    expect(r[0].offerId).toBe("good");
    const sus = r.find((x) => x.offerId === "sus")!;
    expect(sus.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["suspicious_pricing", "poor_return_policy", "inconsistent_reviews", "new_supplier"]));
    expect(r.at(-1)!.offerId).toBe("sus");
  });
});

describe("evaluateAlerts", () => {
  const base = { scoreId: "s1", total: 60, trendClass: "stable" as const, growthPct: 5, activeAds: 10, trackedCompetitors: 1 };
  it("emits nothing without a previous state", () => {
    expect(evaluateAlerts("p", "P", null, base)).toEqual([]);
  });
  it("detects trend up, growth, competition and score change with dedupe keys", () => {
    const alerts = evaluateAlerts("p", "P", base, { scoreId: "s2", total: 72, trendClass: "rapidly_rising", growthPct: 120, activeAds: 20, trackedCompetitors: 1 });
    const kinds = alerts.map((a) => a.kind).sort();
    expect(kinds).toEqual(["competition_increase", "score_change", "substantial_growth", "trend_up"]);
    expect(new Set(alerts.map((a) => a.dedupeKey)).size).toBe(alerts.length);
  });
  it("detects decline once", () => {
    const declined = { ...base, scoreId: "s2", growthPct: -30 };
    expect(evaluateAlerts("p", "P", base, declined).map((a) => a.kind)).toContain("demand_decline");
    expect(evaluateAlerts("p", "P", declined, { ...declined, scoreId: "s3" }).map((a) => a.kind)).not.toContain("demand_decline");
  });
});

describe("parseGoogleTrendsCsv", () => {
  it("parses the classic export", () => {
    const csv = `Category: All categories\n\nWeek,dog paw cleaner: (United States),cat brush: (United States)\n2025-11-16,23,10\n2025-11-23,<1,12\n2025-11-30,40,"15"\n`;
    const r = parseGoogleTrendsCsv(csv);
    expect(r.terms).toEqual(["dog paw cleaner", "cat brush"]);
    expect(r.geo).toBe("United States");
    expect(r.series[0].points.map((p) => p.value)).toEqual([23, 0.5, 40]);
    expect(r.series[1].points.length).toBe(3);
  });
  it("parses month-granularity exports", () => {
    const r = parseGoogleTrendsCsv("Month,widget\n2024-01,50\n2024-02,60\n");
    expect(r.series[0].points[0].date).toBe("2024-01-01T00:00:00.000Z");
  });
  it("rejects non-trends files", () => {
    expect(() => parseGoogleTrendsCsv("a,b\n1,2")).toThrow(/Not a Google Trends CSV/);
  });
});
