import { z } from "zod";
import { keywordList, optionalMoney, shortText, STAGES, uuid } from "./common";

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: shortText(5000).default(""),
  categoryId: uuid.nullable().optional(),
  imageUrl: z
    .union([z.string().trim().url().refine((u) => u.startsWith("https://"), "Image URL must be https"), z.literal("").transform(() => null), z.null()])
    .optional(),
  niche: shortText(120).nullable().optional(),
  targetCustomer: shortText(1000).default(""),
  problemSolved: shortText(1000).default(""),
  keywords: keywordList.default([]),
  estSupplierCost: optionalMoney,
  estShippingCost: optionalMoney,
  estSellingPrice: optionalMoney,
  weightGrams: z.union([z.coerce.number().int().min(0).max(100000), z.literal("").transform(() => null), z.null()]).optional(),
  isFragile: z.boolean().nullable().optional(),
  discoverySource: shortText(80).optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const productUpdateSchema = productInputSchema.partial();

export const SORTS = ["opportunity", "newest", "rising", "declining", "confidence"] as const;
export const DEMAND_DIRECTIONS = ["emerging", "rapidly_rising", "stable", "seasonal", "saturating", "declining", "insufficient_data", "up"] as const;

const num = z.union([z.coerce.number(), z.literal("").transform(() => undefined)]).optional();

export const productFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(), // slug
  niche: z.string().trim().max(120).optional(),
  minPrice: num,
  maxPrice: num,
  minCost: num,
  maxCost: num,
  minMargin: num,
  minCompetition: num, // competition score (higher = less competitive)
  minContent: num,
  minGrowth: num,
  minScore: num,
  direction: z.enum(DEMAND_DIRECTIONS).or(z.literal("")).optional(),
  stage: z.enum(STAGES).or(z.literal("")).optional(),
  bookmarked: z.enum(["1", ""]).optional(),
  includeArchived: z.enum(["1", ""]).optional(),
  sort: z.enum(SORTS).default("opportunity"),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type ProductFilters = z.infer<typeof productFiltersSchema>;

export const stageChangeSchema = z.object({
  stage: z.enum(STAGES),
  reason: z.string().trim().max(1000).optional(),
});
