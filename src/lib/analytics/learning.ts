/**
 * Learning from real test outcomes. Produces *suggestions* only — weights are
 * never changed unless the user explicitly accepts, and every accepted change
 * is versioned with its reason.
 */
import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey, type ScoringWeights } from "./weights";
import { mean, round } from "./math";

export interface OutcomeSample {
  productId: string;
  outcome: "performed_well" | "performed_poorly" | "inconclusive";
  components: Partial<Record<ComponentKey, number | null>>;
}

export interface WeightSuggestion {
  weights: ScoringWeights;
  increase: ComponentKey;
  decrease: ComponentKey;
  reason: string;
  evidence: Array<{ key: ComponentKey; wellMean: number | null; poorMean: number | null; diff: number | null }>;
}

export const LEARNING_RULES = { minPerGroup: 2, minDiff: 10, step: 5, minWeight: 0, maxWeight: 40 } as const;

export function suggestWeights(samples: OutcomeSample[], current: ScoringWeights): { suggestion: WeightSuggestion | null; note: string; evidence: WeightSuggestion["evidence"] } {
  const well = samples.filter((s) => s.outcome === "performed_well");
  const poor = samples.filter((s) => s.outcome === "performed_poorly");
  const evidence = COMPONENT_KEYS.map((k) => {
    const w = mean(well.map((s) => s.components[k]).filter((x): x is number => typeof x === "number"));
    const p = mean(poor.map((s) => s.components[k]).filter((x): x is number => typeof x === "number"));
    return { key: k, wellMean: w === null ? null : round(w, 1), poorMean: p === null ? null : round(p, 1), diff: w !== null && p !== null ? round(w - p, 1) : null };
  });
  if (well.length < LEARNING_RULES.minPerGroup || poor.length < LEARNING_RULES.minPerGroup) {
    return {
      suggestion: null,
      evidence,
      note: `Need at least ${LEARNING_RULES.minPerGroup} products that performed well and ${LEARNING_RULES.minPerGroup} that performed poorly (have ${well.length} and ${poor.length}). Record outcomes on each product's Research history tab.`,
    };
  }
  const ranked = evidence.filter((e) => e.diff !== null).sort((a, b) => b.diff! - a.diff!);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  if (!top || !bottom || top.key === bottom.key || top.diff! < LEARNING_RULES.minDiff) {
    return { suggestion: null, evidence, note: `No component separates winners from losers by ≥${LEARNING_RULES.minDiff} points yet.` };
  }
  const next = { ...current };
  const inc = Math.min(LEARNING_RULES.step, LEARNING_RULES.maxWeight - next[top.key], next[bottom.key] - LEARNING_RULES.minWeight);
  if (inc <= 0) return { suggestion: null, evidence, note: "Suggested change would exceed weight limits." };
  next[top.key] += inc;
  next[bottom.key] -= inc;
  return {
    suggestion: {
      weights: next,
      increase: top.key,
      decrease: bottom.key,
      evidence,
      reason: `Products that performed well scored ${top.diff} points higher on “${COMPONENT_LABELS[top.key]}” than those that performed poorly (${well.length} vs ${poor.length} products), while “${COMPONENT_LABELS[bottom.key]}” separated them least (${bottom.diff}). Suggest moving ${inc} percentage points of weight.`,
    },
    evidence,
    note: "Suggestion based on your recorded outcomes. Small samples are noisy — accept only if it matches your experience.",
  };
}
