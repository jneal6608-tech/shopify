import "server-only";
import { z } from "zod";
import { withUser } from "../db";
import { audit } from "../services/audit";
import { assertNoUserErrors, ShopifyError, shopifyGraphql, type ShopifyConnection } from "./client";
import { getConnection } from "./connection";
import { M, Q } from "./queries";

const gid = (type: string) => z.string().regex(new RegExp(`^gid://shopify/${type}/\\d+$`), `Must be a Shopify ${type} GID`);
const money = z.coerce.number().min(0).max(1_000_000).transform((n) => n.toFixed(2));

export const PAYLOADS = {
  product_create: z.object({
    title: z.string().trim().min(1).max(255),
    descriptionHtml: z.string().max(60_000).default(""),
    productType: z.string().max(255).default(""),
    vendor: z.string().max(255).default(""),
    tags: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
    seo: z.object({ title: z.string().max(70).default(""), description: z.string().max(320).default("") }).default({ title: "", description: "" }),
    option: z.object({ name: z.string().trim().min(1).max(255), values: z.array(z.string().trim().min(1).max(255)).min(1).max(100) }).nullable().default(null),
    price: money,
    compareAtPrice: money.nullable().default(null),
    cost: money.nullable().default(null),
    sku: z.string().max(255).default(""),
    images: z.array(z.object({ url: z.string().url().refine((u) => u.startsWith("https://"), "https only"), alt: z.string().max(512).default("") })).max(20).default([]),
    researchProductId: z.string().uuid().nullable().default(null),
  }),
  product_update: z.object({
    productId: gid("Product"),
    title: z.string().trim().min(1).max(255).optional(),
    descriptionHtml: z.string().max(60_000).optional(),
    productType: z.string().max(255).optional(),
    tags: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
    seo: z.object({ title: z.string().max(70), description: z.string().max(320) }).optional(),
  }),
  product_status: z.object({ productId: gid("Product"), status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]) }),
  price_update: z.object({
    productId: gid("Product"),
    variants: z.array(z.object({ id: gid("ProductVariant"), price: money, compareAtPrice: money.nullable().optional() })).min(1).max(100),
  }),
  collection_create: z.object({
    title: z.string().trim().min(1).max(255),
    descriptionHtml: z.string().max(60_000).default(""),
    handle: z.string().regex(/^[a-z0-9-]{1,255}$/).optional(),
    productIds: z.array(gid("Product")).max(250).default([]),
  }),
  page_create: z.object({
    title: z.string().trim().min(1).max(255),
    body: z.string().max(500_000).default(""),
    handle: z.string().regex(/^[a-z0-9-]{1,255}$/).optional(),
    templateSuffix: z.string().regex(/^[a-z0-9_-]{1,100}$/).optional(),
  }),
  theme_files_upsert: z.object({
    themeId: gid("OnlineStoreTheme"),
    files: z.array(z.object({ filename: z.string().regex(/^(sections|templates|snippets|blocks|assets|layout|config|locales)\/[A-Za-z0-9._\-/]{1,200}$/, "Invalid theme filename"), content: z.string().max(1_000_000) })).min(1).max(20),
    allowLiveTheme: z.boolean().default(false),
  }),
  landing_page: z.object({
    themeId: gid("OnlineStoreTheme"),
    handle: z.string().regex(/^[a-z0-9-]{1,40}$/),
    title: z.string().trim().min(1).max(255),
    sectionLiquid: z.string().max(200_000),
    templateJson: z.string().max(50_000),
    pageBody: z.string().max(10_000).default(""),
    allowLiveTheme: z.boolean().default(false),
  }),
} as const;
export type ChangeKind = keyof typeof PAYLOADS;
export const CHANGE_KINDS = Object.keys(PAYLOADS) as [ChangeKind, ...ChangeKind[]];

export const KIND_LABELS: Record<ChangeKind, string> = {
  product_create: "Create draft product",
  product_update: "Update product content",
  product_status: "Change product status (publish/unpublish)",
  price_update: "Change prices",
  collection_create: "Create collection",
  page_create: "Create page (unpublished)",
  theme_files_upsert: "Modify theme files",
  landing_page: "Create product landing page",
};

type ThemeFile = { filename: string; body?: { content?: string } | null };
async function themeInfo(conn: ShopifyConnection, themeId: string, filenames: string[]) {
  const r = await shopifyGraphql<{ theme: { id: string; name: string; role: string; files: { nodes: ThemeFile[] } } | null }>(conn, Q.themeFiles, { id: themeId, filenames });
  if (!r.theme) throw new ShopifyError("Theme not found", "user_error");
  return r.theme;
}

/** Captures the current state of whatever a change will touch (preview + rollback data). */
export async function captureState(conn: ShopifyConnection, kind: ChangeKind, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (kind) {
    case "product_update":
    case "product_status":
    case "price_update": {
      const r = await shopifyGraphql<{ product: Record<string, unknown> | null }>(conn, Q.product, { id: payload.productId });
      if (!r.product) throw new ShopifyError("Product not found in Shopify", "user_error");
      return { product: r.product };
    }
    case "theme_files_upsert": {
      const files = (payload.files as Array<{ filename: string }>).map((f) => f.filename);
      const t = await themeInfo(conn, payload.themeId as string, files);
      return { theme: { id: t.id, name: t.name, role: t.role }, files: files.map((f) => ({ filename: f, existed: t.files.nodes.some((n) => n.filename === f), content: t.files.nodes.find((n) => n.filename === f)?.body?.content ?? null })) };
    }
    case "landing_page": {
      const h = payload.handle as string;
      const files = [`sections/di-landing-${h}.liquid`, `templates/page.di-landing-${h}.json`];
      const t = await themeInfo(conn, payload.themeId as string, files);
      return { theme: { id: t.id, name: t.name, role: t.role }, files: files.map((f) => ({ filename: f, existed: t.files.nodes.some((n) => n.filename === f), content: t.files.nodes.find((n) => n.filename === f)?.body?.content ?? null })) };
    }
    default:
      return {};
  }
}

/** Human-readable preview of what will change. */
export function describeChange(kind: ChangeKind, payload: Record<string, unknown>, state: Record<string, unknown>): Array<{ field: string; before: string | null; after: string }> {
  const s = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
  const product = state.product as Record<string, unknown> | undefined;
  switch (kind) {
    case "product_create":
      return [
        { field: "Status", before: null, after: "DRAFT (not visible to customers)" },
        { field: "Title", before: null, after: s(payload.title)! },
        { field: "Price", before: null, after: s(payload.price)! },
        { field: "Variants", before: null, after: payload.option ? `${(payload.option as { name: string; values: string[] }).name}: ${(payload.option as { values: string[] }).values.join(", ")}` : "Single variant" },
        { field: "Images", before: null, after: String((payload.images as unknown[]).length) },
      ];
    case "product_update":
      return ["title", "descriptionHtml", "productType", "tags", "seo"].filter((k) => payload[k] !== undefined).map((k) => ({ field: k, before: s(product?.[k]), after: s(payload[k])! }));
    case "product_status":
      return [{ field: "Status", before: s(product?.status), after: s(payload.status)! }];
    case "price_update": {
      const current = ((product?.variants as { nodes: Array<{ id: string; title: string; price: string; compareAtPrice: string | null }> })?.nodes ?? []);
      return (payload.variants as Array<{ id: string; price: string; compareAtPrice?: string | null }>).map((v) => {
        const c = current.find((x) => x.id === v.id);
        return { field: `Price · ${c?.title ?? v.id}`, before: c ? `${c.price}${c.compareAtPrice ? ` (compare ${c.compareAtPrice})` : ""}` : "variant not found", after: `${v.price}${v.compareAtPrice ? ` (compare ${v.compareAtPrice})` : ""}` };
      });
    }
    case "collection_create":
      return [{ field: "Collection", before: null, after: s(payload.title)! }, { field: "Products", before: null, after: String((payload.productIds as unknown[]).length) }];
    case "page_create":
      return [{ field: "Page", before: null, after: `${payload.title} (unpublished)` }];
    case "theme_files_upsert":
    case "landing_page": {
      const files = (state.files as Array<{ filename: string; existed: boolean }>) ?? [];
      const theme = state.theme as { name: string; role: string } | undefined;
      return [
        { field: "Theme", before: null, after: `${theme?.name} (${theme?.role === "MAIN" ? "LIVE theme" : theme?.role?.toLowerCase()})` },
        ...files.map((f) => ({ field: f.filename, before: f.existed ? "exists — will be overwritten (backed up)" : null, after: f.existed ? "updated" : "new file" })),
        ...(kind === "landing_page" ? [{ field: "Page", before: null, after: `${payload.title} (unpublished)` }] : []),
      ];
    }
  }
}

async function upsertFiles(conn: ShopifyConnection, themeId: string, files: Array<{ filename: string; content: string }>) {
  const r = await shopifyGraphql<{ themeFilesUpsert: { userErrors: Array<{ filename?: string; message: string; field?: string[] }> } }>(conn, M.themeFilesUpsert, {
    themeId,
    files: files.map((f) => ({ filename: f.filename, body: { type: "TEXT", value: f.content } })),
  });
  assertNoUserErrors(r.themeFilesUpsert as never, "themeFilesUpsert");
}
async function deleteFiles(conn: ShopifyConnection, themeId: string, files: string[]) {
  if (!files.length) return;
  const r = await shopifyGraphql<{ themeFilesDelete: { userErrors: Array<{ message: string }> } }>(conn, M.themeFilesDelete, { themeId, files });
  assertNoUserErrors(r.themeFilesDelete as never, "themeFilesDelete");
}

async function applyChange(conn: ShopifyConnection, kind: ChangeKind, p: Record<string, unknown>, backup: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (kind) {
    case "product_create": {
      const x = PAYLOADS.product_create.parse(p);
      const r = await shopifyGraphql<{ productCreate: { product: { id: string; handle: string; variants: { nodes: Array<{ id: string }> } } | null; userErrors: never[] } }>(conn, M.productCreate, {
        product: {
          title: x.title,
          descriptionHtml: x.descriptionHtml,
          productType: x.productType || undefined,
          vendor: x.vendor || undefined,
          tags: x.tags,
          status: "DRAFT",
          seo: x.seo.title || x.seo.description ? x.seo : undefined,
          productOptions: x.option ? [{ name: x.option.name, values: x.option.values.map((v) => ({ name: v })) }] : undefined,
        },
        media: x.images.map((i) => ({ originalSource: i.url, alt: i.alt, mediaContentType: "IMAGE" })),
      });
      assertNoUserErrors(r.productCreate, "productCreate");
      const product = r.productCreate.product!;
      const inventoryItem = { tracked: false, ...(x.sku ? { sku: x.sku } : {}), ...(x.cost !== null ? { cost: x.cost } : {}) };
      if (x.option) {
        const v = await shopifyGraphql<{ productVariantsBulkCreate: { userErrors: never[] } }>(conn, M.variantsBulkCreate, {
          productId: product.id,
          strategy: "REMOVE_STANDALONE_VARIANT",
          variants: x.option.values.map((val) => ({ optionValues: [{ optionName: x.option!.name, name: val }], price: x.price, compareAtPrice: x.compareAtPrice, inventoryItem })),
        });
        assertNoUserErrors(v.productVariantsBulkCreate, "productVariantsBulkCreate");
      } else {
        const v = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: never[] } }>(conn, M.variantsBulkUpdate, {
          productId: product.id,
          variants: [{ id: product.variants.nodes[0].id, price: x.price, compareAtPrice: x.compareAtPrice, inventoryItem }],
        });
        assertNoUserErrors(v.productVariantsBulkUpdate, "productVariantsBulkUpdate");
      }
      return { productId: product.id, handle: product.handle, adminUrl: `https://${conn.shopDomain}/admin/products/${product.id.split("/").pop()}` };
    }
    case "product_update": {
      const x = PAYLOADS.product_update.parse(p);
      const { productId, ...fields } = x;
      const r = await shopifyGraphql<{ productUpdate: { userErrors: never[] } }>(conn, M.productUpdate, { product: { id: productId, ...fields } });
      assertNoUserErrors(r.productUpdate, "productUpdate");
      return { productId };
    }
    case "product_status": {
      const x = PAYLOADS.product_status.parse(p);
      const r = await shopifyGraphql<{ productUpdate: { userErrors: never[] } }>(conn, M.productUpdate, { product: { id: x.productId, status: x.status } });
      assertNoUserErrors(r.productUpdate, "productUpdate");
      return { productId: x.productId, status: x.status };
    }
    case "price_update": {
      const x = PAYLOADS.price_update.parse(p);
      const r = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: never[] } }>(conn, M.variantsBulkUpdate, { productId: x.productId, variants: x.variants });
      assertNoUserErrors(r.productVariantsBulkUpdate, "productVariantsBulkUpdate");
      return { productId: x.productId, variants: x.variants.length };
    }
    case "collection_create": {
      const x = PAYLOADS.collection_create.parse(p);
      const r = await shopifyGraphql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: never[] } }>(conn, M.collectionCreate, { input: { title: x.title, descriptionHtml: x.descriptionHtml, handle: x.handle } });
      assertNoUserErrors(r.collectionCreate, "collectionCreate");
      const id = r.collectionCreate.collection!.id;
      if (x.productIds.length) {
        const a = await shopifyGraphql<{ collectionAddProducts: { userErrors: never[] } }>(conn, M.collectionAddProducts, { id, productIds: x.productIds });
        assertNoUserErrors(a.collectionAddProducts, "collectionAddProducts");
      }
      return { collectionId: id, handle: r.collectionCreate.collection!.handle };
    }
    case "page_create": {
      const x = PAYLOADS.page_create.parse(p);
      const r = await shopifyGraphql<{ pageCreate: { page: { id: string; handle: string } | null; userErrors: never[] } }>(conn, M.pageCreate, { page: { ...x, isPublished: false } });
      assertNoUserErrors(r.pageCreate, "pageCreate");
      return { pageId: r.pageCreate.page!.id, handle: r.pageCreate.page!.handle };
    }
    case "theme_files_upsert": {
      const x = PAYLOADS.theme_files_upsert.parse(p);
      await upsertFiles(conn, x.themeId, x.files);
      return { themeId: x.themeId, files: x.files.map((f) => f.filename) };
    }
    case "landing_page": {
      const x = PAYLOADS.landing_page.parse(p);
      const section = `sections/di-landing-${x.handle}.liquid`;
      const template = `templates/page.di-landing-${x.handle}.json`;
      await upsertFiles(conn, x.themeId, [{ filename: section, content: x.sectionLiquid }, { filename: template, content: x.templateJson }]);
      let page;
      try {
        const r = await shopifyGraphql<{ pageCreate: { page: { id: string; handle: string } | null; userErrors: never[] } }>(conn, M.pageCreate, {
          page: { title: x.title, body: x.pageBody, handle: x.handle, isPublished: false, templateSuffix: `di-landing-${x.handle}` },
        });
        assertNoUserErrors(r.pageCreate, "pageCreate");
        page = r.pageCreate.page!;
      } catch (e) {
        // Undo the theme files so a failed apply leaves the theme as it was.
        await restoreFiles(conn, x.themeId, backup);
        throw e;
      }
      return { themeId: x.themeId, files: [section, template], pageId: page.id, pageHandle: page.handle, previewPath: `/pages/${page.handle}` };
    }
  }
}

async function restoreFiles(conn: ShopifyConnection, themeId: string, backup: Record<string, unknown>) {
  const files = (backup.files as Array<{ filename: string; existed: boolean; content: string | null }>) ?? [];
  const restore = files.filter((f) => f.existed && f.content !== null).map((f) => ({ filename: f.filename, content: f.content! }));
  if (restore.length) await upsertFiles(conn, themeId, restore);
  await deleteFiles(conn, themeId, files.filter((f) => !f.existed).map((f) => f.filename));
}

async function rollbackChange(conn: ShopifyConnection, kind: ChangeKind, p: Record<string, unknown>, backup: Record<string, unknown>, result: Record<string, unknown>) {
  const product = backup.product as Record<string, unknown> | undefined;
  switch (kind) {
    case "product_create": {
      const r = await shopifyGraphql<{ productDelete: { userErrors: never[] } }>(conn, M.productDelete, { input: { id: result.productId } });
      assertNoUserErrors(r.productDelete, "productDelete");
      return;
    }
    case "product_update": {
      const fields = ["title", "descriptionHtml", "productType", "tags", "seo"].filter((k) => p[k] !== undefined);
      const restore: Record<string, unknown> = { id: p.productId };
      for (const k of fields) restore[k] = product?.[k];
      const r = await shopifyGraphql<{ productUpdate: { userErrors: never[] } }>(conn, M.productUpdate, { product: restore });
      assertNoUserErrors(r.productUpdate, "productUpdate (rollback)");
      return;
    }
    case "product_status": {
      const r = await shopifyGraphql<{ productUpdate: { userErrors: never[] } }>(conn, M.productUpdate, { product: { id: p.productId, status: product?.status } });
      assertNoUserErrors(r.productUpdate, "productUpdate (rollback)");
      return;
    }
    case "price_update": {
      const nodes = (product?.variants as { nodes: Array<{ id: string; price: string; compareAtPrice: string | null }> }).nodes;
      const ids = new Set((p.variants as Array<{ id: string }>).map((v) => v.id));
      const r = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: never[] } }>(conn, M.variantsBulkUpdate, {
        productId: p.productId,
        variants: nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, price: n.price, compareAtPrice: n.compareAtPrice })),
      });
      assertNoUserErrors(r.productVariantsBulkUpdate, "productVariantsBulkUpdate (rollback)");
      return;
    }
    case "collection_create": {
      const r = await shopifyGraphql<{ collectionDelete: { userErrors: never[] } }>(conn, M.collectionDelete, { input: { id: result.collectionId } });
      assertNoUserErrors(r.collectionDelete, "collectionDelete");
      return;
    }
    case "page_create": {
      const r = await shopifyGraphql<{ pageDelete: { userErrors: never[] } }>(conn, M.pageDelete, { id: result.pageId });
      assertNoUserErrors(r.pageDelete, "pageDelete");
      return;
    }
    case "theme_files_upsert":
      await restoreFiles(conn, p.themeId as string, backup);
      return;
    case "landing_page": {
      if (result.pageId) {
        const r = await shopifyGraphql<{ pageDelete: { userErrors: never[] } }>(conn, M.pageDelete, { id: result.pageId });
        assertNoUserErrors(r.pageDelete, "pageDelete");
      }
      await restoreFiles(conn, p.themeId as string, backup);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle (DB + Shopify). Network calls never run inside a DB transaction.
// ---------------------------------------------------------------------------

export async function createChangeRequest(
  userId: string,
  input: { kind: ChangeKind; title: string; summary?: string; payload: unknown; productId?: string | null; createdBy: "user" | "ai" },
) {
  const payload = PAYLOADS[input.kind].parse(input.payload) as Record<string, unknown>;
  let preview: unknown = null;
  let previewError: string | null = null;
  try {
    const conn = await getConnection(userId);
    const state = await captureState(conn, input.kind, payload);
    preview = { diff: describeChange(input.kind, payload, state), state: summarizeState(state) };
  } catch (e) {
    previewError = (e as Error).message;
    preview = { diff: describeChange(input.kind, payload, {}), error: previewError };
  }
  return withUser(userId, async (db) => {
    const [r] = await db<{ id: string }[]>`
      insert into public.shopify_change_requests (user_id, product_id, kind, status, title, summary, payload, preview, created_by)
      values (${userId}, ${input.productId ?? (payload.researchProductId as string | null) ?? null}, ${input.kind}, 'draft', ${input.title.slice(0, 300)},
        ${(input.summary ?? "").slice(0, 4000)}, ${db.json(payload as never)}, ${db.json(preview as never)}, ${input.createdBy})
      returning id`;
    await audit(db, userId, "shopify.change.draft", "shopify_change_request", r.id, { kind: input.kind, createdBy: input.createdBy });
    return { id: r.id, previewError };
  });
}

function summarizeState(state: Record<string, unknown>) {
  // Keep previews light: theme file contents are kept only in the backup at apply time.
  if (Array.isArray(state.files)) return { ...state, files: (state.files as Array<{ filename: string; existed: boolean }>).map((f) => ({ filename: f.filename, existed: f.existed })) };
  return state;
}

export async function applyChangeRequest(userId: string, id: string, confirm: { confirmed: boolean; confirmLiveTheme?: boolean }) {
  if (!confirm.confirmed) throw new ShopifyError("Explicit confirmation is required to apply a store change.", "user_error");
  // Claim atomically: only a draft can move to applying (prevents double-apply).
  const [cr] = await withUser(userId, (db) => db<{ kind: ChangeKind; payload: Record<string, unknown>; productId: string | null }[]>`
    update public.shopify_change_requests set status = 'applying', approved_at = now() where id = ${id} and status = 'draft'
    returning kind, payload, product_id`);
  if (!cr) throw new ShopifyError("Only draft change requests can be applied (it may already be applied or in progress).", "user_error");
  let backup: Record<string, unknown> = {};
  let started = false; // true once a mutation may have reached Shopify
  try {
    const conn = await getConnection(userId);
    backup = await captureState(conn, cr.kind, cr.payload);
    const theme = backup.theme as { role?: string } | undefined;
    if (theme?.role === "MAIN" && !(cr.payload.allowLiveTheme && confirm.confirmLiveTheme)) {
      throw new ShopifyError("This change targets your LIVE theme. Duplicate the theme in Shopify and target the copy, or explicitly allow live-theme changes and confirm again.", "user_error");
    }
    started = true;
    const result = await applyChange(conn, cr.kind, cr.payload, backup);
    await withUser(userId, async (db) => {
      await db`update public.shopify_change_requests set status = 'applied', applied_at = now(), backup = ${db.json(backup as never)}, result = ${db.json(result as never)}, error = null where id = ${id}`;
      if (cr.kind === "product_create" && cr.productId && typeof result.productId === "string") {
        await db`insert into public.shopify_product_links (user_id, product_id, shopify_product_gid, shopify_handle) values (${userId}, ${cr.productId}, ${result.productId}, ${result.handle as string})
                 on conflict (user_id, shopify_product_gid) do nothing`;
      }
      await audit(db, userId, "shopify.change.applied", "shopify_change_request", id, { kind: cr.kind, result });
    });
    return { status: "applied", result };
  } catch (e) {
    const msg = (e as Error).message;
    await withUser(userId, async (db) => {
      // Nothing reached Shopify → back to draft so it can be retried after fixing the cause.
      await db`update public.shopify_change_requests set status = ${started ? "failed" : "draft"}, error = ${msg.slice(0, 2000)}, backup = ${db.json(backup as never)} where id = ${id}`;
      await audit(db, userId, "shopify.change.failed", "shopify_change_request", id, { kind: cr.kind, error: msg });
    });
    throw e;
  }
}

export async function rollbackChangeRequest(userId: string, id: string) {
  const [cr] = await withUser(userId, (db) => db<{ kind: ChangeKind; payload: Record<string, unknown>; backup: Record<string, unknown>; result: Record<string, unknown> }[]>`
    update public.shopify_change_requests set status = 'applying' where id = ${id} and status = 'applied' returning kind, payload, backup, result`);
  if (!cr) throw new ShopifyError("Only applied changes can be rolled back.", "user_error");
  try {
    const conn = await getConnection(userId);
    await rollbackChange(conn, cr.kind, cr.payload, cr.backup ?? {}, cr.result ?? {});
    await withUser(userId, async (db) => {
      await db`update public.shopify_change_requests set status = 'rolled_back', rolled_back_at = now() where id = ${id}`;
      if (cr.kind === "product_create") await db`delete from public.shopify_product_links where shopify_product_gid = ${cr.result.productId as string}`;
      await audit(db, userId, "shopify.change.rolled_back", "shopify_change_request", id, { kind: cr.kind });
    });
    return { status: "rolled_back" };
  } catch (e) {
    await withUser(userId, (db) => db`update public.shopify_change_requests set status = 'applied', error = ${`Rollback failed: ${(e as Error).message}`.slice(0, 2000)} where id = ${id}`);
    throw e;
  }
}
