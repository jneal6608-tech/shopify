import { z } from "zod";

export const COMPONENT_KEYS = [
  "demand",
  "content",
  "profit",
  "competition",
  "problem",
  "longevity",
  "shipping",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  demand: "Demand growth",
  content: "Organic content potential",
  profit: "Profit potential",
  competition: "Competition (higher = less competitive)",
  problem: "Problem-solving value",
  longevity: "Market longevity",
  shipping: "Shipping practicality",
};

export type ScoringWeights = Record<ComponentKey, number>;

/** Initial weights from the product brief. Must sum to 100. */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  demand: 20,
  content: 20,
  profit: 20,
  competition: 15,
  problem: 10,
  longevity: 10,
  shipping: 5,
};

export const weightsSchema = z
  .object(
    Object.fromEntries(COMPONENT_KEYS.map((k) => [k, z.number().int().min(0).max(100)])) as Record<
      ComponentKey,
      z.ZodNumber
    >,
  )
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, {
    message: "Weights must sum to 100",
  });

export function describeWeightChange(prev: ScoringWeights, next: ScoringWeights): string[] {
  return COMPONENT_KEYS.filter((k) => prev[k] !== next[k]).map(
    (k) => `${COMPONENT_LABELS[k]}: ${prev[k]}% → ${next[k]}%`,
  );
}
