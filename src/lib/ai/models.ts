/** Models the user can choose between (Settings → AI). */
export const SELECTABLE_MODELS = {
  "claude-opus-5-5": {
    label: "Claude Opus 5.5",
    description: "Most capable. Best for scripts, nuanced analysis and store copy. ~2× the cost of Sonnet.",
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    description: "Fast and capable at about half the cost of Opus. Slightly less polished long-form writing.",
  },
} as const;
export type SelectableModel = keyof typeof SELECTABLE_MODELS;
export const DEFAULT_MODEL: SelectableModel = "claude-opus-5-5";

/**
 * USD per million tokens (first-party API list prices, cached 2026-11).
 * Includes models a server-side refusal fallback may route to.
 */
export const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function estimateCostUsd(model: string, u: TokenUsage): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5-5"];
  const cost =
    (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.input * 1.25) / 1_000_000;
  return Math.round(cost * 10_000) / 10_000;
}

/** Rough per-use estimates shown in Settings (from the planning discussion). */
export const FEATURE_COST_ESTIMATES: Array<{ feature: string; label: string; opus: string; sonnet: string }> = [
  { feature: "product_evaluation", label: "Product research report", opus: "$0.08–0.15", sonnet: "$0.04–0.08" },
  { feature: "content_pack", label: "Content pack (10 concepts, 10 hooks, 5 scripts)", opus: "$0.25–0.40", sonnet: "$0.12–0.20" },
  { feature: "content_assessment", label: "AI content-potential rubric suggestion", opus: "$0.03–0.06", sonnet: "$0.02–0.03" },
  { feature: "competitor_analysis", label: "Competitor / differentiation analysis", opus: "$0.06–0.10", sonnet: "$0.03–0.05" },
  { feature: "comparison", label: "Comparison report (up to 5 products)", opus: "$0.11–0.15", sonnet: "$0.05–0.08" },
  { feature: "validation_analysis", label: "Testing validation analysis", opus: "$0.07–0.10", sonnet: "$0.04–0.05" },
  { feature: "listing", label: "Shopify listing", opus: "~$0.08", sonnet: "~$0.04" },
  { feature: "landing_page", label: "Landing page / store change", opus: "$0.15–0.25", sonnet: "$0.08–0.13" },
  { feature: "daily_summary", label: "Daily research summary narrative", opus: "~$0.10/day", sonnet: "~$0.05/day" },
];
