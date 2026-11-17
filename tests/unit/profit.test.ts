import { describe, expect, it } from "vitest";
import { computeScenarios, computeUnitEconomics, DEFAULT_PROFIT_INPUT, type ProfitInput } from "@/lib/analytics/profit";

const base: ProfitInput = { ...DEFAULT_PROFIT_INPUT, sellingPrice: 30, supplierCost: 8, shippingCost: 4 };

describe("computeUnitEconomics", () => {
  it("computes contribution and margins", () => {
    const u = computeUnitEconomics(base);
    // fees: 30*2.9% + 0.30 = 1.17; refunds 5% = 1.5; other 0.5; cogs 12
    expect(u.paymentFees).toBeCloseTo(1.17, 2);
    expect(u.expectedRefundCost).toBeCloseTo(1.5, 2);
    expect(u.totalVariableCosts).toBeCloseTo(15.17, 2);
    expect(u.contributionBeforeMarketing).toBeCloseTo(14.83, 2);
    expect(u.contributionMarginPct).toBeCloseTo(49.4, 1);
    expect(u.breakEvenCac).toBeCloseTo(14.83, 2);
    expect(u.breakEvenUnitsPerMonth).toBe(3); // 39 / 14.83
  });

  it("break-even price yields zero contribution", () => {
    const u = computeUnitEconomics(base);
    const atBreakEven = computeUnitEconomics({ ...base, sellingPrice: u.breakEvenSellingPrice! });
    expect(Math.abs(atBreakEven.contributionBeforeMarketing)).toBeLessThan(0.02);
  });

  it("separates contribution before and after marketing", () => {
    const u = computeUnitEconomics({ ...base, marketingPerUnit: 20 });
    expect(u.contributionBeforeMarketing).toBeGreaterThan(0);
    expect(u.contributionAfterMarketing).toBeLessThan(0);
    expect(u.breakEvenUnitsPerMonth).toBeNull();
    expect(u.warnings.join(" ")).toMatch(/Marketing cost per sale exceeds/);
  });

  it("warns on loss-making prices", () => {
    const u = computeUnitEconomics({ ...base, sellingPrice: 10 });
    expect(u.contributionBeforeMarketing).toBeLessThan(0);
    expect(u.warnings.join(" ")).toMatch(/loses money/);
  });

  it("rejects invalid inputs", () => {
    expect(() => computeUnitEconomics({ ...base, supplierCost: -1 })).toThrow();
    expect(() => computeUnitEconomics({ ...base, refundRatePct: 100 })).toThrow();
    expect(() => computeUnitEconomics({ ...base, sellingPrice: Number.NaN })).toThrow();
  });
});

describe("computeScenarios", () => {
  it("scales with volume and subtracts fixed costs once", () => {
    const rows = computeScenarios(base, [10, 100]);
    expect(rows[0].grossRevenue).toBe(300);
    expect(rows[0].netProfit).toBeCloseTo(14.83 * 10 - 39, 1);
    expect(rows[1].netProfit).toBeCloseTo(14.83 * 100 - 39, 0);
    expect(rows[1].fixedCosts).toBe(39);
  });
  it("rejects fractional volumes", () => {
    expect(() => computeScenarios(base, [1.5])).toThrow();
  });
});
