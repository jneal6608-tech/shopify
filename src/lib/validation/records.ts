import { z } from "zod";
import { optionalMoney, optionalUrl, shortText } from "./common";

const optInt = z.union([z.coerce.number().int().min(0), z.literal("").transform(() => null), z.null()]).optional();
const optRating = z.union([z.coerce.number().min(0).max(5), z.literal("").transform(() => null), z.null()]).optional();
const stringList = z.array(z.string().trim().min(1).max(300)).max(30).default([]);

export const competitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: optionalUrl,
  channel: z.enum(["shopify_store", "amazon", "tiktok_shop", "etsy", "other_marketplace", "other"]).default("shopify_store"),
  price: optionalMoney,
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  positioning: shortText(2000).default(""),
  presentationNotes: shortText(2000).default(""),
  descriptionExcerpt: shortText(4000).default(""),
  reviewCount: optInt,
  avgRating: optRating,
  adActivity: z.enum(["unknown", "none_observed", "some", "heavy"]).default("unknown"),
  marketingAngles: stringList,
  complaints: stringList,
  observedAt: z.coerce.date().default(() => new Date()),
});

export const referenceVideoSchema = z.object({
  platform: z.enum(["tiktok", "instagram", "youtube", "other"]),
  url: optionalUrl,
  creator: shortText(200).default(""),
  hookText: shortText(1000).default(""),
  structureNotes: shortText(4000).default(""),
  viewsObserved: optInt,
  likesObserved: optInt,
  commentsObserved: optInt,
  observedAt: z.coerce.date().default(() => new Date()),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  platform: z.enum(["aliexpress", "cj_dropshipping", "alibaba", "zendrop", "spocket", "temu", "private_agent", "other"]).default("other"),
  url: optionalUrl,
  storeRating: optRating,
  storeReviewCount: optInt,
  yearsActive: z.union([z.coerce.number().min(0).max(100), z.literal("").transform(() => null), z.null()]).optional(),
  location: shortText(120).default(""),
  returnPolicy: shortText(2000).default(""),
  notes: shortText(4000).default(""),
});

export const offerSchema = z
  .object({
    supplierId: z.string().uuid(),
    url: optionalUrl,
    unitCost: z.coerce.number().min(0).max(100000),
    shippingCost: optionalMoney,
    shipDaysMin: optInt,
    shipDaysMax: optInt,
    moq: z.union([z.coerce.number().int().min(1), z.literal("").transform(() => null), z.null()]).optional(),
    variants: stringList,
    hasClearSpecs: z.boolean().nullable().default(null),
    productRating: optRating,
    productReviewCount: optInt,
    sampleQuality: z.union([z.coerce.number().int().min(1).max(5), z.literal("").transform(() => null), z.null()]).optional(),
    notes: shortText(4000).default(""),
  })
  .refine((o) => o.shipDaysMin == null || o.shipDaysMax == null || o.shipDaysMin <= o.shipDaysMax, { message: "Min delivery days cannot exceed max", path: ["shipDaysMin"] });

export const thresholdsSchema = z.object({
  scoreChange: z.number().min(1).max(100).optional(),
  substantialGrowthPct: z.number().min(1).max(10000).optional(),
  declinePct: z.number().min(-100).max(-1).optional(),
  competitionIncreasePct: z.number().min(1).max(10000).optional(),
});

export const testingProjectSchema = z.object({
  budgetUsd: optionalMoney,
  hoursPerWeek: z.union([z.coerce.number().min(0).max(168), z.literal("").transform(() => null), z.null()]).optional(),
  hypothesis: shortText(2000).optional(),
  successCriteria: shortText(2000).optional(),
  sampleCost: optionalMoney,
});

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  platform: z.enum(["tiktok", "instagram", "youtube", "multi"]),
  format: z.string().trim().min(1).max(60),
  angle: shortText(1000).default(""),
  status: z.enum(["planned", "producing", "published", "paused", "done"]).default("planned"),
  shopifyUtmCampaign: z.union([z.string().regex(/^[a-z0-9_-]{1,80}$/, "lowercase letters, digits, - and _"), z.literal("").transform(() => null), z.null()]).optional(),
});

export const videoSchema = z.object({
  campaignId: z.union([z.string().uuid(), z.literal("").transform(() => null), z.null()]).optional(),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
  url: optionalUrl,
  title: shortText(300).default(""),
  hook: shortText(500).default(""),
  format: shortText(60).default(""),
  durationSec: z.union([z.coerce.number().int().min(1).max(600), z.literal("").transform(() => null), z.null()]).optional(),
  publishedAt: z.coerce.date(),
});

const count = z.coerce.number().int().min(0).max(10_000_000_000).default(0);
export const performanceSchema = z.object({
  capturedAt: z.coerce.date().default(() => new Date()),
  views: count,
  likes: count,
  comments: count,
  shares: count,
  saves: count,
  profileVisits: count,
  linkClicks: count,
});

export const salesSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    sessions: optInt,
    addToCarts: optInt,
    orders: z.coerce.number().int().min(0).default(0),
    units: optInt,
    revenue: z.coerce.number().min(0).default(0),
    refundCount: z.coerce.number().int().min(0).default(0),
    refundsAmount: z.coerce.number().min(0).default(0),
    adSpend: z.coerce.number().min(0).default(0),
  })
  .refine((s) => s.periodStart <= s.periodEnd, { message: "Period start must be before end", path: ["periodStart"] });
