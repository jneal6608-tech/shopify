/**
 * Unit economics and scenario modelling. Pure functions; used by the Profit
 * Calculator UI, the scoring engine and the testing workspace.
 *
 * Terminology
 *  - Contribution before marketing: what one sale contributes after all
 *    variable costs (product, shipping, fees, expected refunds, other variable
 *    costs) but before any marketing spend. This is the maximum you could pay
 *    to acquire a customer and break even (break-even CAC).
 *  - Contribution after marketing: contribution before marketing minus the
 *    marketing cost attributed to each sale.
 *  - Net profit (scenario): contribution after marketing × units, minus fixed
 *    monthly costs (Shopify plan, apps, tools).
 *
 * Refund assumption: a refunded order returns the full selling price to the
 * customer and the product cost is not recovered (typical for low-cost
 * dropshipped goods where return shipping exceeds item value).
 */
import { round } from "./math";

export interface ProfitInput {
  sellingPrice: number;
  supplierCost: number;
  shippingCost: number;
  /** Payment processor percentage, e.g. 2.9 for 2.9%. */
  paymentFeePct: number;
  /** Payment processor fixed fee per order, e.g. 0.30. */
  paymentFixedFee: number;
  /** Shopify transaction fee % when not using Shopify Payments (0 otherwise). */
  shopifyTxnFeePct: number;
  /** Expected refund rate %, e.g. 5 for 5% of orders. */
  refundRatePct: number;
  /** Packaging, inserts, app fees per order, etc. */
  otherVariablePerUnit: number;
  /** Marketing cost attributed per sale (0 for purely organic). */
  marketingPerUnit: number;
  /** Shopify plan + apps + tools per month. */
  fixedMonthlyCosts: number;
}

export const DEFAULT_PROFIT_INPUT: Omit<ProfitInput, "sellingPrice" | "supplierCost" | "shippingCost"> = {
  paymentFeePct: 2.9,
  paymentFixedFee: 0.3,
  shopifyTxnFeePct: 0,
  refundRatePct: 5,
  otherVariablePerUnit: 0.5,
  marketingPerUnit: 0,
  fixedMonthlyCosts: 39,
};

export interface UnitEconomics {
  revenuePerUnit: number;
  costOfGoods: number; // supplier + shipping
  paymentFees: number;
  shopifyFees: number;
  expectedRefundCost: number;
  otherVariable: number;
  totalVariableCosts: number;
  contributionBeforeMarketing: number;
  contributionMarginPct: number | null;
  marketingPerUnit: number;
  contributionAfterMarketing: number;
  netMarginPct: number | null;
  breakEvenSellingPrice: number | null;
  breakEvenCac: number;
  breakEvenUnitsPerMonth: number | null;
  warnings: string[];
}

export interface ScenarioRow {
  units: number;
  grossRevenue: number;
  refunds: number;
  variableCosts: number;
  contributionBeforeMarketing: number;
  marketing: number;
  fixedCosts: number;
  netProfit: number;
  netMarginPct: number | null;
}

function assertFinite(input: ProfitInput) {
  for (const [k, v] of Object.entries(input)) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Invalid value for ${k}`);
    if (v < 0) throw new Error(`${k} cannot be negative`);
  }
  for (const k of ["paymentFeePct", "shopifyTxnFeePct", "refundRatePct"] as const) {
    if (input[k] >= 100) throw new Error(`${k} must be below 100%`);
  }
}

export function computeUnitEconomics(input: ProfitInput): UnitEconomics {
  assertFinite(input);
  const p = input.sellingPrice;
  const cogs = input.supplierCost + input.shippingCost;
  const paymentFees = p * (input.paymentFeePct / 100) + input.paymentFixedFee;
  const shopifyFees = p * (input.shopifyTxnFeePct / 100);
  const expectedRefundCost = p * (input.refundRatePct / 100);
  const otherVariable = input.otherVariablePerUnit;
  const totalVariableCosts = cogs + paymentFees + shopifyFees + expectedRefundCost + otherVariable;
  const contributionBefore = p - totalVariableCosts;
  const contributionAfter = contributionBefore - input.marketingPerUnit;

  // Price at which contribution before marketing is exactly zero:
  //   P (1 - fee% - shopify% - refund%) = cogs + fixedFee + other
  const pctShare = (input.paymentFeePct + input.shopifyTxnFeePct + input.refundRatePct) / 100;
  const breakEvenPrice =
    pctShare < 1 ? (cogs + input.paymentFixedFee + otherVariable) / (1 - pctShare) : null;

  const warnings: string[] = [];
  if (p <= 0) warnings.push("Selling price is zero.");
  if (contributionBefore <= 0) warnings.push("Each sale loses money before any marketing spend.");
  if (contributionAfter <= 0 && contributionBefore > 0)
    warnings.push("Marketing cost per sale exceeds the contribution per sale.");
  if (p > 0 && cogs / p > 0.5) warnings.push("Product + shipping cost exceeds 50% of the selling price.");

  return {
    revenuePerUnit: round(p),
    costOfGoods: round(cogs),
    paymentFees: round(paymentFees),
    shopifyFees: round(shopifyFees),
    expectedRefundCost: round(expectedRefundCost),
    otherVariable: round(otherVariable),
    totalVariableCosts: round(totalVariableCosts),
    contributionBeforeMarketing: round(contributionBefore),
    contributionMarginPct: p > 0 ? round((contributionBefore / p) * 100, 1) : null,
    marketingPerUnit: round(input.marketingPerUnit),
    contributionAfterMarketing: round(contributionAfter),
    netMarginPct: p > 0 ? round((contributionAfter / p) * 100, 1) : null,
    breakEvenSellingPrice: breakEvenPrice === null ? null : round(breakEvenPrice),
    breakEvenCac: round(Math.max(0, contributionBefore)),
    breakEvenUnitsPerMonth:
      contributionAfter > 0 ? Math.ceil(input.fixedMonthlyCosts / contributionAfter) : null,
    warnings,
  };
}

export function computeScenarios(input: ProfitInput, volumes: number[] = [10, 50, 100, 500]): ScenarioRow[] {
  const u = computeUnitEconomics(input);
  return volumes.map((units) => {
    if (!Number.isInteger(units) || units < 0) throw new Error("Volumes must be non-negative integers");
    const gross = input.sellingPrice * units;
    const refunds = u.expectedRefundCost * units;
    const variable = (u.totalVariableCosts - u.expectedRefundCost) * units;
    const contribution = u.contributionBeforeMarketing * units;
    const marketing = input.marketingPerUnit * units;
    const net = contribution - marketing - input.fixedMonthlyCosts;
    return {
      units,
      grossRevenue: round(gross),
      refunds: round(refunds),
      variableCosts: round(variable),
      contributionBeforeMarketing: round(contribution),
      marketing: round(marketing),
      fixedCosts: round(input.fixedMonthlyCosts),
      netProfit: round(net),
      netMarginPct: gross > 0 ? round((net / gross) * 100, 1) : null,
    };
  });
}
