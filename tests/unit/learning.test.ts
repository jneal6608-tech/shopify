import { describe, expect, it } from "vitest";
import { suggestWeights } from "@/lib/analytics/learning";
import { DEFAULT_WEIGHTS, weightsSchema } from "@/lib/analytics/weights";

const s = (outcome: "performed_well" | "performed_poorly", content: number, demand: number) => ({ productId: Math.random().toString(), outcome, components: { content, demand, profit: 60, competition: 50 } });

describe("suggestWeights", () => {
  it("refuses to suggest with too few outcomes", () => {
    const r = suggestWeights([s("performed_well", 90, 50)], DEFAULT_WEIGHTS);
    expect(r.suggestion).toBeNull();
    expect(r.note).toMatch(/Need at least/);
  });
  it("moves weight toward the component that separates winners", () => {
    const r = suggestWeights([s("performed_well", 90, 50), s("performed_well", 85, 55), s("performed_poorly", 40, 60), s("performed_poorly", 45, 58)], DEFAULT_WEIGHTS);
    expect(r.suggestion?.increase).toBe("content");
    expect(r.suggestion?.decrease).toBe("demand");
    expect(weightsSchema.safeParse(r.suggestion!.weights).success).toBe(true);
    expect(r.suggestion!.weights.content).toBe(25);
  });
  it("does not suggest when differences are small", () => {
    const r = suggestWeights([s("performed_well", 60, 50), s("performed_well", 62, 50), s("performed_poorly", 58, 50), s("performed_poorly", 57, 50)], DEFAULT_WEIGHTS);
    expect(r.suggestion).toBeNull();
  });
});
