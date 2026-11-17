import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, resetTestDb, USER_A, USER_B, useTestEnv } from "../helpers/db";
import { closeDb, withService, withUser } from "@/lib/db";
import { bootstrapUser } from "@/lib/services/bootstrap";
import { createProduct, getProduct, listProducts, setStage, updateProduct } from "@/lib/services/products";
import { insertObservations } from "@/lib/services/observations";
import { scoreProduct } from "@/lib/services/scoring";
import { weekly } from "../helpers/series";

beforeAll(async () => {
  useTestEnv();
  await resetTestDb();
  await createAuthUser(USER_A, "a@example.com");
  await createAuthUser(USER_B, "b@example.com");
  await bootstrapUser(USER_A, "a@example.com");
  await bootstrapUser(USER_B, "b@example.com");
});
afterAll(async () => closeDb());

describe("bootstrap", () => {
  it("creates profile, preferences, weights v1 and jobs idempotently", async () => {
    await bootstrapUser(USER_A, "a@example.com");
    const r = await withUser(USER_A, async (db) => ({
      prefs: await db`select * from user_preferences`,
      weights: await db`select * from scoring_weight_versions`,
      jobs: await db`select * from research_jobs`,
    }));
    expect(r.prefs.length).toBe(1);
    expect(r.weights.length).toBe(1);
    expect(r.jobs.length).toBe(8);
  });
});

describe("row level security", () => {
  let productA: string;
  beforeAll(async () => {
    productA = await withUser(USER_A, (db) => createProduct(db, USER_A, { name: "Paw cleaner", description: "", targetCustomer: "", problemSolved: "", keywords: ["paw"] }));
  });

  it("hides other users' products", async () => {
    const list = await withUser(USER_B, (db) => listProducts(db, {}));
    expect(list.find((p) => p.id === productA)).toBeUndefined();
    await expect(withUser(USER_B, (db) => getProduct(db, productA))).rejects.toThrow(/not found/);
  });

  it("prevents updating or deleting other users' rows", async () => {
    const r = await withUser(USER_B, (db) => db`update products set name = 'hacked' where id = ${productA}`);
    expect(r.count).toBe(0);
    const d = await withUser(USER_B, (db) => db`delete from products where id = ${productA}`);
    expect(d.count).toBe(0);
  });

  it("prevents inserting rows owned by someone else", async () => {
    await expect(
      withUser(USER_B, (db) => db`insert into products (user_id, name) values (${USER_A}, 'spoof')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("prevents attaching data to another user's product via composite FKs", async () => {
    await expect(
      withUser(USER_B, (db) => insertObservations(db, USER_B, productA, [{ sourceKey: "manual", metric: "amazon_bsr", observedAt: new Date(), value: 1 }])),
    ).rejects.toThrow(/foreign key/);
  });

  it("denies access to server-only tables", async () => {
    await expect(withUser(USER_A, (db) => db`select * from shopify_credentials`)).rejects.toThrow(/permission denied/);
    await expect(withUser(USER_A, (db) => db`select * from rate_limits`)).rejects.toThrow(/permission denied/);
    await expect(withUser(USER_A, (db) => db`insert into data_sources (key, name, kind, reliability) values ('x','x','api',1)`)).rejects.toThrow(/permission denied/);
  });

  it("shows built-in categories to everyone and custom ones only to owners", async () => {
    await withUser(USER_A, (db) => db`insert into categories (user_id, name, slug) values (${USER_A}, 'Mine', 'mine')`);
    const b = await withUser(USER_B, (db) => db`select slug from categories`);
    expect(b.map((r) => r.slug)).not.toContain("mine");
    expect(b.length).toBe(11);
  });

  it("the service role sees everything", async () => {
    const all = await withService((db) => db`select count(*)::int as n from products`);
    expect(all[0].n).toBeGreaterThanOrEqual(1);
  });
});

describe("products service", () => {
  it("validates via constraints (no negative prices)", async () => {
    await expect(
      withUser(USER_A, (db) => createProduct(db, USER_A, { name: "Neg", description: "", targetCustomer: "", problemSolved: "", keywords: [], estSellingPrice: -5 })),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects duplicate names per user, allows across users", async () => {
    await withUser(USER_A, (db) => createProduct(db, USER_A, { name: "Dup", description: "", targetCustomer: "", problemSolved: "", keywords: [] }));
    await expect(withUser(USER_A, (db) => createProduct(db, USER_A, { name: "dup", description: "", targetCustomer: "", problemSolved: "", keywords: [] }))).rejects.toThrow(/duplicate/);
    await withUser(USER_B, (db) => createProduct(db, USER_B, { name: "Dup", description: "", targetCustomer: "", problemSolved: "", keywords: [] }));
  });

  it("filters, searches and records stage history", async () => {
    const id = await withUser(USER_A, (db) =>
      createProduct(db, USER_A, { name: "Car seat gap filler", description: "Stops things falling", targetCustomer: "", problemSolved: "Lost phones", keywords: ["car"], estSellingPrice: 25, estSupplierCost: 5, estShippingCost: 3 }),
    );
    const found = await withUser(USER_A, (db) => listProducts(db, { q: "gap", maxCost: 10 }));
    expect(found.map((p) => p.id)).toEqual([id]);
    expect(found[0].estGrossMarginPct).toBe(68);
    const none = await withUser(USER_A, (db) => listProducts(db, { q: "gap", minMargin: 80 }));
    expect(none.length).toBe(0);
    await withUser(USER_A, (db) => setStage(db, USER_A, id, "researching", "Looks good"));
    const ev = await withUser(USER_A, (db) => db`select to_stage from product_stage_events where product_id = ${id} order by id`);
    expect(ev.map((e) => e.toStage)).toEqual(["discovered", "researching"]);
    await withUser(USER_A, (db) => setStage(db, USER_A, id, "archived"));
    expect((await withUser(USER_A, (db) => listProducts(db, { q: "gap" }))).length).toBe(0);
    expect((await withUser(USER_A, (db) => listProducts(db, { q: "gap", includeArchived: "1" }))).length).toBe(1);
    await withUser(USER_A, (db) => updateProduct(db, id, { name: "Car seat gap filler v2" }));
  });
});

describe("observations & scoring", () => {
  it("dedupes observations and stores score history only on change", async () => {
    const id = await withUser(USER_A, (db) =>
      createProduct(db, USER_A, { name: "Scored", description: "", targetCustomer: "", problemSolved: "", keywords: [], estSellingPrice: 30, estSupplierCost: 6, estShippingCost: 3 }),
    );
    const pts = weekly(30, (i) => (i < 22 ? 20 : 40), new Date());
    const obs = pts.map((p) => ({ sourceKey: "google_trends_csv", metric: "search_interest", query: "scored", observedAt: p.date, value: p.value }));
    const first = await withUser(USER_A, (db) => insertObservations(db, USER_A, id, obs));
    const again = await withUser(USER_A, (db) => insertObservations(db, USER_A, id, obs));
    expect(first.inserted).toBe(30);
    expect(again.inserted).toBe(0);

    const s1 = await withUser(USER_A, (db) => scoreProduct(db, USER_A, id));
    expect(s1.stored).toBe(true);
    expect(s1.result.trend.classification).toBe("rapidly_rising");
    const s2 = await withUser(USER_A, (db) => scoreProduct(db, USER_A, id));
    expect(s2.stored).toBe(false);
    await withUser(USER_A, (db) => db`insert into product_assessments (user_id, product_id, kind, ratings, assessed_by) values (${USER_A}, ${id}, 'problem', ${db.json({ severity: 4, frequency: 4, clarity: 4 })}, 'user')`);
    const s3 = await withUser(USER_A, (db) => scoreProduct(db, USER_A, id));
    expect(s3.stored).toBe(true);
    const overview = await withUser(USER_A, (db) => getProduct(db, id));
    expect(overview.scoreId).toBe(s3.scoreId);
    expect(overview.trendClass).toBe("rapidly_rising");
    expect(overview.growthPct).toBeGreaterThan(50);
  });
});
