import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, resetTestDb, USER_A, USER_B, useTestEnv } from "../helpers/db";
import { call } from "../helpers/api";
import { closeDb } from "@/lib/db";
import * as products from "@/app/api/products/route";
import * as product from "@/app/api/products/[id]/route";
import * as observations from "@/app/api/products/[id]/observations/route";
import * as importTrends from "@/app/api/products/[id]/import-trends/route";
import * as assessments from "@/app/api/products/[id]/assessments/route";
import * as competitors from "@/app/api/products/[id]/competitors/route";
import * as suppliers from "@/app/api/suppliers/route";
import * as offers from "@/app/api/products/[id]/offers/route";
import * as supplierReport from "@/app/api/products/[id]/supplier-report/route";
import * as watchlist from "@/app/api/watchlist/route";
import * as stage from "@/app/api/products/[id]/stage/route";
import * as videos from "@/app/api/products/[id]/videos/route";
import * as perf from "@/app/api/videos/[id]/performance/route";
import * as sales from "@/app/api/products/[id]/sales/route";
import * as decisions from "@/app/api/products/[id]/decisions/route";
import * as ai from "@/app/api/products/[id]/ai/[feature]/route";
import * as demo from "@/app/api/demo/route";
import { withUser } from "@/lib/db";
import { validationFor } from "@/lib/services/testing";

beforeAll(async () => {
  useTestEnv();
  delete process.env.ANTHROPIC_API_KEY;
  await resetTestDb();
  await createAuthUser(USER_A, "a@example.com");
  await createAuthUser(USER_B, "b@example.com");
});
afterAll(async () => closeDb());

function csv(weeks: number) {
  const rows = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(Date.now() - (weeks - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10);
    return `${d},${i < weeks * 0.7 ? 20 : 45}`;
  });
  return `Category: All categories\n\nWeek,paw cleaner: (United States)\n${rows.join("\n")}\n`;
}

describe("end-to-end research → validation workflow via API", () => {
  let id = "";
  it("creates and scores a product", async () => {
    const r = await call(products.POST, { user: USER_A, body: { name: "Paw cleaner cup", keywords: ["paw cleaner"], estSellingPrice: 29.99, estSupplierCost: 6.5, estShippingCost: 3, weightGrams: 300 } });
    expect(r.status).toBe(200);
    id = r.data.id;
    const p = await call(product.GET, { user: USER_A, params: { id } });
    expect(p.data.scoreTotal).not.toBeNull();
    expect(p.data.recommendation).toBe("insufficient_evidence");
  });

  it("isolates users at the API level", async () => {
    const r = await call(product.GET, { user: USER_B, params: { id } });
    expect(r.status).toBe(404);
    const u = await call(product.PATCH, { user: USER_B, params: { id }, method: "PATCH", body: { name: "hijack" } });
    expect(u.status).toBe(404);
  });

  it("imports Google Trends CSV, dedupes re-imports and classifies the trend", async () => {
    const first = await call(importTrends.POST, { user: USER_A, params: { id }, body: { csv: csv(52) } });
    expect(first.status).toBe(200);
    expect(first.data.inserted).toBe(52);
    const again = await call(importTrends.POST, { user: USER_A, params: { id }, body: { csv: csv(52) } });
    expect(again.data.inserted).toBe(0);
    const p = await call(product.GET, { user: USER_A, params: { id } });
    expect(["rapidly_rising", "emerging"]).toContain(p.data.trendClass);
  });

  it("requires a source URL for manual observations", async () => {
    const bad = await call(observations.POST, { user: USER_A, params: { id }, body: { sourceKey: "amazon_manual", metric: "amazon_top_review_count", value: 1200, observedAt: new Date().toISOString() } });
    expect(bad.status).toBe(400);
    const ok = await call(observations.POST, { user: USER_A, params: { id }, body: { sourceKey: "amazon_manual", metric: "amazon_top_review_count", value: 1200, observedAt: new Date().toISOString(), sourceUrl: "https://www.amazon.com/dp/EXAMPLE" } });
    expect(ok.data.inserted).toBe(1);
  });

  it("records assessments, competitors, suppliers and builds a reliability report", async () => {
    const content = Object.fromEntries(["closeup_demo", "problem_solution", "before_after", "satisfying", "comparison", "educational", "curiosity", "text_overlay", "voiceover", "cinematic", "unboxing", "customer_use"].map((k) => [k, 2]));
    expect((await call(assessments.POST, { user: USER_A, params: { id }, body: { kind: "content", ratings: content } })).status).toBe(200);
    expect((await call(assessments.POST, { user: USER_A, params: { id }, body: { kind: "content", ratings: { ...content, closeup_demo: 9 } } })).status).toBe(400);
    expect((await call(assessments.POST, { user: USER_A, params: { id }, body: { kind: "problem", ratings: { severity: 4, frequency: 5, clarity: 5 } } })).status).toBe(200);
    expect((await call(competitors.POST, { user: USER_A, params: { id }, body: { name: "PawCo", price: 34.99, complaints: ["leaks"] } })).status).toBe(200);
    const s = await call(suppliers.POST, { user: USER_A, body: { name: "Supplier X", storeRating: 4.8, storeReviewCount: 3000, returnPolicy: "30 days" } });
    expect((await call(offers.POST, { user: USER_A, params: { id }, body: { supplierId: s.data.id, unitCost: 5.9, shippingCost: 2.8, shipDaysMin: 6, shipDaysMax: 12, hasClearSpecs: true } })).status).toBe(200);
    const badOffer = await call(offers.POST, { user: USER_A, params: { id }, body: { supplierId: s.data.id, unitCost: 5, shipDaysMin: 20, shipDaysMax: 10 } });
    expect(badOffer.status).toBe(400);
    const rep = await call(supplierReport.POST, { user: USER_A, params: { id }, body: {} });
    expect(rep.data.report[0].reliabilityScore).toBeGreaterThan(60);
    const p = await call(product.GET, { user: USER_A, params: { id } });
    expect(p.data.scoreConfidence).toBeGreaterThan(40);
  });

  it("watches, moves to testing and validates with real metrics", async () => {
    expect((await call(watchlist.POST, { user: USER_A, body: { productId: id } })).status).toBe(200);
    expect((await call(stage.POST, { user: USER_A, params: { id }, body: { stage: "testing", reason: "Sample approved" } })).status).toBe(200);
    const v = await call(videos.POST, { user: USER_A, params: { id }, body: { platform: "tiktok", publishedAt: new Date().toISOString(), hook: "Muddy paws?", format: "problem_solution" } });
    const vid = v.data.id;
    expect((await call(perf.POST, { user: USER_A, params: { id: vid }, body: { capturedAt: new Date(Date.now() - 86_400_000).toISOString(), views: 9000, likes: 700, linkClicks: 80 } })).status).toBe(200);
    const lower = await call(perf.POST, { user: USER_A, params: { id: vid }, body: { capturedAt: new Date().toISOString(), views: 100 } });
    expect(lower.status).toBe(400); // cumulative metrics cannot go down
    await call(sales.POST, { user: USER_A, params: { id }, body: { periodStart: "2026-11-01", periodEnd: "2026-11-10", sessions: 200, addToCarts: 15, orders: 6, revenue: 180 } });
    const val = await withUser(USER_A, (db) => validationFor(db, id));
    expect(val.result.purchase.orders).toBe(6);
    expect(val.result.verdict).toBe("converting");
    expect((await call(decisions.POST, { user: USER_A, params: { id }, body: { decision: "continued", outcome: "performed_well", actualMarginPct: 41 } })).status).toBe(200);
  });

  it("AI endpoints fail clearly when AI is not configured", async () => {
    const r = await call(ai.POST, { user: USER_A, params: { id, feature: "evaluation" }, body: {} });
    expect(r.status).toBe(503);
    expect(r.error?.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("loads and removes clearly labelled demo data", async () => {
    const l = await call(demo.POST, { user: USER_B, body: {} });
    expect(l.data.created).toBe(7);
    const list = await call(products.GET, { user: USER_B, url: "http://localhost:3000/api/products?limit=50" });
    expect(list.data.every((p: { isDemo: boolean; name: string }) => p.isDemo && p.name.startsWith("[DEMO]"))).toBe(true);
    const rm = await call(demo.DELETE, { user: USER_B, method: "DELETE", body: {} });
    expect(rm.data.removedProducts).toBe(7);
  });

  it("rejects cross-origin mutations and enforces rate limits", async () => {
    const r = await call(products.POST, { user: USER_A, body: { name: "x" }, headers: { origin: "https://evil.example" } });
    expect(r.status).toBe(403);
    let last = 200;
    for (let i = 0; i < 62; i++) last = (await call(products.POST, { user: USER_B, body: { name: `bulk ${i}` } })).status;
    expect(last).toBe(429);
  });
});
