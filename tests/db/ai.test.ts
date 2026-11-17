import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthUser, resetTestDb, USER_A, useTestEnv } from "../helpers/db";
import { closeDb, withUser } from "@/lib/db";
import { bootstrapUser } from "@/lib/services/bootstrap";
import { createProduct } from "@/lib/services/products";
import { scoreProduct } from "@/lib/services/scoring";
import { generateEvaluation } from "@/lib/ai/features";

const evaluation = {
  summary: "s", strengths: ["a"], weaknesses: [], risks: [], competitiveConcerns: [], recommendationRationale: "r", facelessMarketingView: "f",
  evidence: [{ claim: "c", basis: "measured", source: "x" }], missingInformation: ["trend data"], nextSteps: ["collect"],
};

function sse(text: string, stopReason = "end_turn") {
  const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  return [
    ev("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 1 } } }),
    ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    ev("content_block_stop", { type: "content_block_stop", index: 0 }),
    ev("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1000 } }),
    ev("message_stop", { type: "message_stop" }),
  ].join("");
}

let productId = "";
const requests: Array<Record<string, any>> = [];
// The SDK client is a singleton that keeps the fetch it was created with, so a
// single stub is installed and its response is switched per test.
let next = { text: "", stopReason: "end_turn" };
const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
  requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers });
  return new Response(sse(next.text, next.stopReason), { status: 200, headers: { "content-type": "text/event-stream" } });
});
function stubAnthropic(text: string, stopReason = "end_turn") {
  next = { text, stopReason };
}

beforeAll(async () => {
  useTestEnv();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  await resetTestDb();
  await createAuthUser(USER_A, "a@example.com");
  await bootstrapUser(USER_A, "a@example.com");
  productId = await withUser(USER_A, async (db) => {
    const id = await createProduct(db, USER_A, { name: "AI test", description: "", targetCustomer: "", problemSolved: "", keywords: [], estSellingPrice: 25, estSupplierCost: 5 });
    await scoreProduct(db, USER_A, id);
    return id;
  });
  await withUser(USER_A, (db) => db`update user_preferences set ai_model = 'claude-sonnet-5-5'`);
  vi.stubGlobal("fetch", fetchStub);
});
afterEach(() => fetchStub.mockClear());
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  await closeDb();
});

describe("AI runner", () => {
  it("sends a well-formed structured-output request with the user's model and fallbacks, and meters usage", async () => {
    stubAnthropic(JSON.stringify(evaluation));
    const r = await generateEvaluation(USER_A, productId);
    expect(r.data.summary).toBe("s");
    const req = requests.at(-1)!;
    expect(req.url).toContain("/v1/messages");
    expect(req.body.model).toBe("claude-sonnet-5-5");
    expect(req.body.stream).toBe(true);
    expect(req.body.fallbacks).toBe("default");
    expect(req.body.output_config.format.type).toBe("json_schema");
    expect(req.body.temperature).toBeUndefined();
    expect(req.body.thinking?.type === "disabled").toBe(false);
    expect(JSON.stringify(req.body.messages)).toContain("AI test"); // grounded in platform data
    const [usage] = await withUser(USER_A, (db) => db<{ costUsd: number; inputTokens: number; outputTokens: number; model: string }[]>`select * from ai_usage`);
    expect(usage).toMatchObject({ inputTokens: 2000, outputTokens: 1000, model: "claude-sonnet-5-5" });
    expect(usage.costUsd).toBeCloseTo((2000 * 2 + 1000 * 10) / 1e6, 6);
    const [rep] = await withUser(USER_A, (db) => db`select kind, model from research_reports`);
    expect(rep).toMatchObject({ kind: "product_evaluation", model: "claude-sonnet-5-5" });
  });

  it("rejects malformed model output instead of storing it", async () => {
    stubAnthropic(JSON.stringify({ summary: 5 }));
    await expect(generateEvaluation(USER_A, productId)).rejects.toThrow(/did not match|structure/i);
  });

  it("handles refusals and truncation explicitly", async () => {
    stubAnthropic("", "refusal");
    await expect(generateEvaluation(USER_A, productId)).rejects.toThrow(/declined/);
    stubAnthropic('{"summary":"cut', "max_tokens");
    await expect(generateEvaluation(USER_A, productId)).rejects.toThrow(/cut off|structure/);
  });

  it("enforces the monthly budget before calling the API", async () => {
    await withUser(USER_A, (db) => db`update user_preferences set ai_monthly_budget_usd = 0.001`);
    await expect(generateEvaluation(USER_A, productId)).rejects.toThrow(/budget reached/);
    expect(fetchStub).not.toHaveBeenCalled();
    await withUser(USER_A, (db) => db`update user_preferences set ai_monthly_budget_usd = null`);
  });
});
