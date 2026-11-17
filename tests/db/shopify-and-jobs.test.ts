import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthUser, resetTestDb, USER_A, useTestEnv } from "../helpers/db";
import { closeDb, withService, withUser } from "@/lib/db";
import { bootstrapUser } from "@/lib/services/bootstrap";
import { connectStore } from "@/lib/shopify/connection";
import { applyChangeRequest, createChangeRequest, rollbackChangeRequest } from "@/lib/shopify/changes";
import { createProduct } from "@/lib/services/products";
import { runDueJobs } from "@/lib/jobs/runner";

/** Minimal in-memory fake of the Shopify GraphQL Admin API + token endpoint. */
function fakeShopify() {
  const state = {
    products: new Map<string, { id: string; title: string; status: string; variants: Array<{ id: string; price: string; compareAtPrice: string | null; title: string }> }>(),
    theme: { id: "gid://shopify/OnlineStoreTheme/2", role: "UNPUBLISHED", files: new Map<string, string>([["templates/index.json", '{"original":true}']]) },
    live: { id: "gid://shopify/OnlineStoreTheme/1", role: "MAIN" },
    pages: new Map<string, string>(),
    seq: 100,
    tokenCalls: 0,
    throttleOnce: true,
    authHeaders: [] as string[],
  };
  const handler = async (url: string, init?: RequestInit) => {
    if (url.endsWith("/admin/oauth/access_token")) {
      state.tokenCalls++;
      const b = JSON.parse(String(init?.body));
      if (b.client_secret !== "good-secret") return new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 });
      return new Response(JSON.stringify({ access_token: `tok_${state.tokenCalls}`, expires_in: 86399, scope: "read_products" }), { status: 200 });
    }
    state.authHeaders.push((init?.headers as Record<string, string>)["X-Shopify-Access-Token"]);
    const { query, variables: v } = JSON.parse(String(init?.body));
    const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (state.throttleOnce && query.includes("ProductCreate")) {
      state.throttleOnce = false;
      return new Response(JSON.stringify({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }], extensions: { cost: { requestedQueryCost: 10, throttleStatus: { currentlyAvailable: 9, restoreRate: 1000 } } } }), { status: 200 });
    }
    if (query.includes("currentAppInstallation")) return ok({ shop: { name: "Test Store", myshopifyDomain: "test.myshopify.com", currencyCode: "USD" }, currentAppInstallation: { accessScopes: [{ handle: "read_products" }, { handle: "write_products" }] } });
    if (query.includes("ProductCreate")) {
      const id = `gid://shopify/Product/${++state.seq}`;
      state.products.set(id, { id, title: v.product.title, status: v.product.status, variants: [{ id: `gid://shopify/ProductVariant/${++state.seq}`, price: "0.00", compareAtPrice: null, title: "Default" }] });
      return ok({ productCreate: { product: { id, handle: "test", status: "DRAFT", variants: { nodes: [{ id: state.products.get(id)!.variants[0].id }] } }, userErrors: [] } });
    }
    if (query.includes("VariantsBulkUpdate")) {
      const p = state.products.get(v.productId)!;
      for (const x of v.variants) Object.assign(p.variants.find((y) => y.id === x.id)!, { price: x.price, compareAtPrice: x.compareAtPrice ?? null });
      return ok({ productVariantsBulkUpdate: { productVariants: [], userErrors: [] } });
    }
    if (query.includes("query Product(")) {
      const p = state.products.get(v.id);
      return ok({ product: p ? { ...p, variants: { nodes: p.variants } } : null });
    }
    if (query.includes("ProductDelete")) {
      state.products.delete(v.input.id);
      return ok({ productDelete: { deletedProductId: v.input.id, userErrors: [] } });
    }
    if (query.includes("ThemeFiles(")) {
      const t = v.id === state.live.id ? { ...state.live, files: new Map() } : state.theme;
      return ok({ theme: { id: t.id, name: "Theme", role: t.role, files: { nodes: (v.filenames as string[]).filter((f) => t.files.has(f)).map((f) => ({ filename: f, body: { content: t.files.get(f) } })) } } });
    }
    if (query.includes("ThemeFilesUpsert")) {
      for (const f of v.files) state.theme.files.set(f.filename, f.body.value);
      return ok({ themeFilesUpsert: { upsertedThemeFiles: [], userErrors: [] } });
    }
    if (query.includes("ThemeFilesDelete")) {
      for (const f of v.files) state.theme.files.delete(f);
      return ok({ themeFilesDelete: { deletedThemeFiles: [], userErrors: [] } });
    }
    if (query.includes("PageCreate")) {
      const id = `gid://shopify/Page/${++state.seq}`;
      state.pages.set(id, v.page.title);
      return ok({ pageCreate: { page: { id, handle: v.page.handle }, userErrors: [] } });
    }
    if (query.includes("PageDelete")) {
      state.pages.delete(v.id);
      return ok({ pageDelete: { deletedPageId: v.id, userErrors: [] } });
    }
    return new Response(JSON.stringify({ errors: [{ message: `unhandled: ${query.slice(0, 40)}` }] }), { status: 200 });
  };
  return { state, handler };
}

let fake: ReturnType<typeof fakeShopify>;
beforeAll(async () => {
  useTestEnv();
  await resetTestDb();
  await createAuthUser(USER_A, "a@example.com");
  await bootstrapUser(USER_A, "a@example.com");
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => closeDb());

function stub() {
  fake = fakeShopify();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => fake.handler(String(url), init)));
}

describe("Shopify connection & change requests (mocked Admin API)", () => {
  it("rejects bad client credentials and stores encrypted tokens for good ones", async () => {
    stub();
    await expect(connectStore(USER_A, { shopDomain: "test.myshopify.com", authMode: "client_credentials", clientId: "cid", clientSecret: "bad" })).rejects.toThrow(/Token exchange failed/);
    const r = await connectStore(USER_A, { shopDomain: "test.myshopify.com", authMode: "client_credentials", clientId: "cid", clientSecret: "good-secret" });
    expect(r.shopName).toBe("Test Store");
    const [cred] = await withService((db) => db<{ encryptedAccessToken: string; encryptedClientSecret: string }[]>`select * from shopify_credentials`);
    expect(cred.encryptedAccessToken.startsWith("v1:")).toBe(true);
    expect(cred.encryptedAccessToken).not.toContain("tok_");
    expect(cred.encryptedClientSecret).not.toContain("good-secret");
  });

  it("creates a DRAFT product only after approval, retries throttling, links it, and rolls back", async () => {
    stub();
    await connectStore(USER_A, { shopDomain: "test.myshopify.com", authMode: "admin_token", accessToken: "shpat_test_token_123" });
    const productId = await withUser(USER_A, (db) => createProduct(db, USER_A, { name: "Linked product", description: "", targetCustomer: "", problemSolved: "", keywords: [] }));
    const cr = await createChangeRequest(USER_A, { kind: "product_create", title: "Create", payload: { title: "Paw Cup", price: 29.99, cost: 6.5, researchProductId: productId }, createdBy: "ai" });
    expect(fake.state.products.size).toBe(0); // drafting never touches the store
    await expect(applyChangeRequest(USER_A, cr.id, { confirmed: false })).rejects.toThrow(/confirmation/);
    const applied = await applyChangeRequest(USER_A, cr.id, { confirmed: true });
    expect(applied.status).toBe("applied");
    const created = [...fake.state.products.values()][0];
    expect(created.status).toBe("DRAFT");
    expect(created.variants[0].price).toBe("29.99");
    expect(fake.state.authHeaders.every((h) => h === "shpat_test_token_123")).toBe(true);
    await expect(applyChangeRequest(USER_A, cr.id, { confirmed: true })).rejects.toThrow(/Only draft/); // no double-apply
    const [link] = await withUser(USER_A, (db) => db`select * from shopify_product_links`);
    expect(link.productId).toBe(productId);
    await rollbackChangeRequest(USER_A, cr.id);
    expect(fake.state.products.size).toBe(0);
    const [row] = await withUser(USER_A, (db) => db`select status from shopify_change_requests where id = ${cr.id}`);
    expect(row.status).toBe("rolled_back");
  });

  it("backs up theme files, restores them on rollback, and refuses the live theme", async () => {
    stub();
    const cr = await createChangeRequest(USER_A, {
      kind: "theme_files_upsert", title: "Theme", createdBy: "user",
      payload: { themeId: fake.state.theme.id, files: [{ filename: "templates/index.json", content: '{"new":true}' }, { filename: "sections/di-new.liquid", content: "<div></div>" }] },
    });
    await applyChangeRequest(USER_A, cr.id, { confirmed: true });
    expect(fake.state.theme.files.get("templates/index.json")).toBe('{"new":true}');
    const [row] = await withUser(USER_A, (db) => db<{ backup: { files: Array<{ filename: string; existed: boolean; content: string | null }> } }[]>`select backup from shopify_change_requests where id = ${cr.id}`);
    expect(row.backup.files.find((f) => f.filename === "templates/index.json")?.content).toBe('{"original":true}');
    await rollbackChangeRequest(USER_A, cr.id);
    expect(fake.state.theme.files.get("templates/index.json")).toBe('{"original":true}');
    expect(fake.state.theme.files.has("sections/di-new.liquid")).toBe(false);

    const live = await createChangeRequest(USER_A, { kind: "theme_files_upsert", title: "Live", createdBy: "ai", payload: { themeId: fake.state.live.id, files: [{ filename: "sections/x.liquid", content: "x" }] } });
    await expect(applyChangeRequest(USER_A, live.id, { confirmed: true })).rejects.toThrow(/LIVE theme/);
    const [lr] = await withUser(USER_A, (db) => db`select status from shopify_change_requests where id = ${live.id}`);
    expect(lr.status).toBe("draft"); // nothing reached Shopify → stays a draft
  });

  it("rejects payloads with path traversal or non-Shopify IDs before anything is stored", async () => {
    stub();
    await expect(createChangeRequest(USER_A, { kind: "theme_files_upsert", title: "x", createdBy: "ai", payload: { themeId: fake.state.theme.id, files: [{ filename: "../config/settings_data.json", content: "" }] } })).rejects.toThrow();
    await expect(createChangeRequest(USER_A, { kind: "price_update", title: "x", createdBy: "ai", payload: { productId: "1; drop table", variants: [] } })).rejects.toThrow();
  });
});

describe("scheduled jobs", () => {
  it("claims each due job exactly once under concurrent cron invocations", async () => {
    await withService((db) => db`update research_jobs set next_run_at = now() - interval '1 minute', enabled = true where user_id = ${USER_A} and kind in ('trend_alerts','weekly_category_report')`);
    const [a, b] = await Promise.all([runDueJobs(10), runDueJobs(10)]);
    const ran = [...a, ...b].map((r) => r.kind).sort();
    expect(ran.filter((k) => k === "trend_alerts").length).toBe(1);
    const runs = await withService((db) => db<{ n: number }[]>`select count(*)::int as n from job_runs where user_id = ${USER_A}`);
    expect(runs[0].n).toBe(ran.length);
    const [job] = await withService((db) => db<{ nextRunAt: Date; lockedUntil: Date | null }[]>`select next_run_at, locked_until from research_jobs where user_id = ${USER_A} and kind = 'trend_alerts'`);
    expect(job.lockedUntil).toBeNull();
    expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });
});
