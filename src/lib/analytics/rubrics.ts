/**
 * Assessment rubrics. These are judgement-based inputs (rated by the user, or
 * suggested by the AI and labelled as an AI estimate). They are kept separate
 * from measured data everywhere in the platform.
 */
import { z } from "zod";

export const FACELESS_FORMATS = [
  { key: "closeup_demo", label: "Close-up product demonstration" },
  { key: "problem_solution", label: "Problem-and-solution" },
  { key: "before_after", label: "Before-and-after (truthful)" },
  { key: "satisfying", label: "Satisfying demonstration" },
  { key: "comparison", label: "Product comparison" },
  { key: "educational", label: "Educational" },
  { key: "curiosity", label: "Curiosity-driven" },
  { key: "text_overlay", label: "Text-overlay" },
  { key: "voiceover", label: "Voiceover" },
  { key: "cinematic", label: "Cinematic product footage" },
  { key: "unboxing", label: "Unboxing" },
  { key: "customer_use", label: "Customer-use demonstration" },
] as const;

export type FacelessFormatKey = (typeof FACELESS_FORMATS)[number]["key"];
export const FORMAT_KEYS = FACELESS_FORMATS.map((f) => f.key) as [FacelessFormatKey, ...FacelessFormatKey[]];

/** 0 = not viable, 1 = weak, 2 = good, 3 = excellent */
export const contentRatingsSchema = z.object(
  Object.fromEntries(FORMAT_KEYS.map((k) => [k, z.number().int().min(0).max(3)])) as Record<
    FacelessFormatKey,
    z.ZodNumber
  >,
);
export type ContentRatings = z.infer<typeof contentRatingsSchema>;

/** Each 0–5. */
export const problemRatingsSchema = z.object({
  severity: z.number().int().min(0).max(5),
  frequency: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
});
export type ProblemRatings = z.infer<typeof problemRatingsSchema>;

/** 0 = pure fad … 5 = evergreen need */
export const longevityRatingsSchema = z.object({
  evergreen: z.number().int().min(0).max(5),
  repeatPurchase: z.number().int().min(0).max(5),
});
export type LongevityRatings = z.infer<typeof longevityRatingsSchema>;

export const RUBRIC_HELP = {
  content:
    "Rate how well the product can be shown in each faceless format: 0 not viable, 1 weak, 2 good, 3 excellent.",
  problem: "Severity, frequency and clarity of the problem the product solves (0–5 each).",
  longevity: "Evergreen need (0 = fad, 5 = permanent need) and repeat-purchase potential (0–5).",
} as const;
