import type { FieldDef } from "@/components/ui/record-form";

export const COMPETITOR_FIELDS: FieldDef[] = [
  { name: "name", label: "Competitor / store name", type: "text", required: true },
  { name: "url", label: "URL", type: "url" },
  { name: "channel", label: "Channel", type: "select", options: [
    { value: "shopify_store", label: "Shopify / DTC store" }, { value: "amazon", label: "Amazon" }, { value: "tiktok_shop", label: "TikTok Shop" },
    { value: "etsy", label: "Etsy" }, { value: "other_marketplace", label: "Other marketplace" }, { value: "other", label: "Other" } ] },
  { name: "price", label: "Price (as listed)", type: "number", step: "0.01" },
  { name: "reviewCount", label: "Review count (as displayed)", type: "number", step: "1" },
  { name: "avgRating", label: "Average rating (0–5)", type: "number", step: "0.1" },
  { name: "adActivity", label: "Ad activity observed", type: "select", options: [
    { value: "unknown", label: "Unknown" }, { value: "none_observed", label: "None observed" }, { value: "some", label: "Some" }, { value: "heavy", label: "Heavy" } ] },
  { name: "observedAt", label: "Observed on", type: "date" },
  { name: "positioning", label: "Positioning", type: "textarea" },
  { name: "presentationNotes", label: "Store presentation notes", type: "textarea" },
  { name: "descriptionExcerpt", label: "Product description excerpt", type: "textarea" },
  { name: "marketingAngles", label: "Marketing angles seen", type: "list" },
  { name: "complaints", label: "Customer complaints in reviews", type: "list" },
];

export const REFERENCE_VIDEO_FIELDS: FieldDef[] = [
  { name: "platform", label: "Platform", type: "select", options: [{ value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }, { value: "youtube", label: "YouTube" }, { value: "other", label: "Other" }] },
  { name: "url", label: "Public video URL", type: "url" },
  { name: "creator", label: "Creator / account", type: "text" },
  { name: "observedAt", label: "Observed on", type: "date" },
  { name: "viewsObserved", label: "Views shown on platform", type: "number", step: "1", hint: "Leave blank if not visible — never estimate" },
  { name: "likesObserved", label: "Likes shown", type: "number", step: "1" },
  { name: "commentsObserved", label: "Comments shown", type: "number", step: "1" },
  { name: "hookText", label: "Opening hook (what is said/shown in first 2s)", type: "textarea" },
  { name: "structureNotes", label: "Structure, demo style, editing notes", type: "textarea" },
];

export const SUPPLIER_FIELDS: FieldDef[] = [
  { name: "name", label: "Supplier name", type: "text", required: true },
  { name: "platform", label: "Platform", type: "select", options: [
    { value: "aliexpress", label: "AliExpress" }, { value: "cj_dropshipping", label: "CJ Dropshipping" }, { value: "alibaba", label: "Alibaba" }, { value: "zendrop", label: "Zendrop" },
    { value: "spocket", label: "Spocket" }, { value: "temu", label: "Temu" }, { value: "private_agent", label: "Private agent" }, { value: "other", label: "Other" } ] },
  { name: "url", label: "Store URL", type: "url" },
  { name: "storeRating", label: "Store rating (0–5)", type: "number", step: "0.1" },
  { name: "storeReviewCount", label: "Store review count", type: "number", step: "1" },
  { name: "yearsActive", label: "Years active", type: "number", step: "0.1" },
  { name: "location", label: "Warehouse / location", type: "text" },
  { name: "returnPolicy", label: "Return policy", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export function offerFields(suppliers: Array<{ id: string; name: string }>): FieldDef[] {
  return [
    { name: "supplierId", label: "Supplier", type: "select", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
    { name: "url", label: "Listing URL", type: "url" },
    { name: "unitCost", label: "Unit cost ($)", type: "number", required: true, step: "0.01" },
    { name: "shippingCost", label: "Shipping cost ($)", type: "number", step: "0.01" },
    { name: "shipDaysMin", label: "Delivery days (min)", type: "number", step: "1" },
    { name: "shipDaysMax", label: "Delivery days (max)", type: "number", step: "1" },
    { name: "moq", label: "Minimum order qty", type: "number", step: "1" },
    { name: "productRating", label: "Product rating (0–5)", type: "number", step: "0.1" },
    { name: "productReviewCount", label: "Product review count", type: "number", step: "1" },
    { name: "hasClearSpecs", label: "Clear specifications?", type: "bool" },
    { name: "sampleQuality", label: "Sample quality (1–5, after receiving)", type: "number", step: "1" },
    { name: "variants", label: "Variants available", type: "list" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}
