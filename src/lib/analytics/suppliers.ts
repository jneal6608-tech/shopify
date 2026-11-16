/**
 * Supplier reliability assessment. Deterministic red-flag rules — a supplier
 * is never assumed trustworthy; absent information is itself flagged.
 */
import { median, round } from "./math";

export interface SupplierOfferInput {
  offerId: string;
  supplierId: string;
  supplierName: string;
  platform: string;
  url: string | null;
  storeRating: number | null;
  storeReviewCount: number | null;
  yearsActive: number | null;
  returnPolicy: string;
  unitCost: number;
  shippingCost: number | null;
  shipDaysMin: number | null;
  shipDaysMax: number | null;
  moq: number | null;
  variants: string[];
  hasClearSpecs: boolean | null;
  productRating: number | null;
  productReviewCount: number | null;
  sampleQuality: number | null;
}

export type FlagSeverity = "info" | "warning" | "critical";
export interface SupplierFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

export interface SupplierAssessment {
  offerId: string;
  supplierName: string;
  landedCost: number | null;
  reliabilityScore: number;
  flags: SupplierFlag[];
  rank: number;
}

const PENALTY: Record<FlagSeverity, number> = { info: 3, warning: 12, critical: 30 };

export function assessOffer(o: SupplierOfferInput, peerMedianCost: number | null): Omit<SupplierAssessment, "rank"> {
  const flags: SupplierFlag[] = [];
  const add = (code: string, severity: FlagSeverity, message: string) => flags.push({ code, severity, message });

  if (o.hasClearSpecs === false) add("unclear_specs", "warning", "Product specifications are unclear or incomplete.");
  if (o.hasClearSpecs === null) add("specs_unverified", "info", "Specification clarity not yet checked.");
  if (o.storeRating === null) add("no_store_rating", "warning", "No store rating recorded.");
  else if (o.storeRating < 4.5) add("low_store_rating", o.storeRating < 4 ? "critical" : "warning", `Store rating ${o.storeRating}/5 is below 4.5.`);
  if (o.storeReviewCount === null || o.storeReviewCount < 100)
    add("thin_review_history", "warning", `Store review history is thin (${o.storeReviewCount ?? "unknown"} reviews).`);
  if (o.productRating !== null && o.storeRating !== null && o.storeRating - o.productRating >= 0.6)
    add("inconsistent_reviews", "warning", `Product rating (${o.productRating}) is much lower than the store rating (${o.storeRating}).`);
  if (o.productReviewCount !== null && o.productReviewCount < 20)
    add("few_product_reviews", "info", `Only ${o.productReviewCount} product reviews.`);
  if (o.shipDaysMax === null) add("no_shipping_estimate", "warning", "No delivery-time estimate recorded.");
  else {
    if (o.shipDaysMax > 20) add("slow_shipping", "warning", `Delivery can take up to ${o.shipDaysMax} days.`);
    if (o.shipDaysMin !== null && o.shipDaysMax - o.shipDaysMin > 10)
      add("unreliable_shipping_estimate", "warning", `Delivery window is very wide (${o.shipDaysMin}–${o.shipDaysMax} days).`);
  }
  if (o.shippingCost === null) add("no_shipping_cost", "info", "Shipping cost not recorded.");
  const rp = o.returnPolicy.trim().toLowerCase();
  if (!rp) add("no_return_policy", "warning", "No return policy recorded.");
  else if (/no return|non-?refundable|all sales final/.test(rp)) add("poor_return_policy", "critical", "Return policy does not allow returns.");
  if (o.yearsActive !== null && o.yearsActive < 1) add("new_supplier", "warning", `Supplier has been active for under a year (${o.yearsActive}).`);
  if (o.yearsActive !== null && o.yearsActive < 1 && peerMedianCost !== null && o.unitCost < peerMedianCost * 0.6)
    add("suspicious_pricing", "critical", `New supplier priced ${round((1 - o.unitCost / peerMedianCost) * 100, 0)}% below the median of other offers.`);
  if (!o.url) add("no_url", "info", "No listing URL recorded — details cannot be re-verified.");
  if (o.moq !== null && o.moq > 1) add("moq", "info", `Minimum order quantity is ${o.moq}.`);
  if (o.sampleQuality !== null && o.sampleQuality <= 2) add("poor_sample", "critical", `Sample quality rated ${o.sampleQuality}/5.`);

  let score = 100 - flags.reduce((a, f) => a + PENALTY[f.severity], 0);
  if (o.sampleQuality !== null && o.sampleQuality >= 4) score += 10; // verified with a physical sample
  return {
    offerId: o.offerId,
    supplierName: o.supplierName,
    landedCost: o.shippingCost === null ? null : round(o.unitCost + o.shippingCost),
    reliabilityScore: Math.max(0, Math.min(100, score)),
    flags,
  };
}

export function compareOffers(offers: SupplierOfferInput[]): SupplierAssessment[] {
  return offers
    .map((o) => {
      const peers = offers.filter((p) => p.offerId !== o.offerId).map((p) => p.unitCost);
      return assessOffer(o, median(peers));
    })
    .sort((a, b) => {
      // Reliability first (in 10-point bands), then landed cost.
      const band = Math.floor(b.reliabilityScore / 10) - Math.floor(a.reliabilityScore / 10);
      if (band !== 0) return band;
      return (a.landedCost ?? Infinity) - (b.landedCost ?? Infinity);
    })
    .map((a, i) => ({ ...a, rank: i + 1 }));
}
