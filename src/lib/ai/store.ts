import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { withUser } from "../db";
import { productBundle } from "../services/bundle";
import { runStructured, userModel, recordUsage, usageFrom, mapApiError, monthToDateSpend } from "./run";
import { getAnthropic, HONESTY_RULES } from "./client";
import { AiUnavailableError } from "./errors";
import { landingPageSchema, listingSchema, storefrontSchema } from "./schemas";
import { getConnection } from "../shopify/connection";
import { shopifyGraphql } from "../shopify/client";
import { Q } from "../shopify/queries";
import { createChangeRequest, PAYLOADS } from "../shopify/changes";
import { buildLandingSection, buildLandingTemplate, landingHandle } from "../shopify/landing";
import { listProducts } from "../services/products";
import { logger } from "../logger";

const STORE_RULES = `Store copy rules: write benefit-led, honest copy for an umbrella Shopify store. Never invent reviews, ratings, testimonials, certifications, "as seen on", sales counts, scarcity or medical/health claims. Only state specifications present in the data; put anything uncertain in claimsToVerify/notes. Shipping and returns statements must match the supplier data provided or be marked as placeholders to confirm.`;

export async function generateListing(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  return runStructured(userId, {
    feature: "listing",
    schema: listingSchema,
    effort: "medium",
    instructions: `Prepare a Shopify product listing from the research data. ${STORE_RULES}`,
    input: bundle,
  });
}

export async function generateLandingContent(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  return runStructured(userId, {
    feature: "landing_page",
    schema: landingPageSchema,
    effort: "medium",
    instructions: `Write content for a mobile-first, product-specific landing page inside an umbrella store: product-specific headline, demonstration section (designed around a short faceless demo video), problem-and-solution messaging, benefits, specifications, FAQs, trust information (only verifiable facts) and a clear call to action. ${STORE_RULES}`,
    input: bundle,
  });
}

export async function generateStorefront(userId: string, brief: string) {
  const { products, store } = await withUser(userId, async (db) => ({
    products: (await listProducts(db, { limit: 30 })).map((p) => ({ name: p.name, category: p.categoryName, stage: p.stage, score: p.scoreTotal, problem: p.problemSolved, price: p.estSellingPrice, is_demo: p.isDemo })),
    store: (await db`select shop_name, currency_code from public.shopify_integrations limit 1`)[0] ?? null,
  }));
  return runStructured(userId, {
    feature: "storefront",
    schema: storefrontSchema,
    effort: "medium",
    instructions: `Generate storefront content for the operator's umbrella Shopify store from their brief and research products: homepage hero, announcement bar, promotional banners, collection descriptions, navigation structure, complementary product ideas and DRAFT shipping/returns policies (clearly marked as drafts requiring the operator's review and legal check). ${STORE_RULES}`,
    input: { brief, store, researchProducts: products },
  });
}

/** Turns generated landing content into a ready-to-review landing_page change request payload. */
export function landingPayload(content: z.infer<typeof landingPageSchema>, opts: { themeId: string; productName: string; productHandle: string | null; allowLiveTheme?: boolean }) {
  const handle = landingHandle(opts.productName);
  return PAYLOADS.landing_page.parse({
    themeId: opts.themeId,
    handle,
    title: content.headline.slice(0, 255),
    sectionLiquid: buildLandingSection(content, handle),
    templateJson: buildLandingTemplate(`di-landing-${handle}`, opts.productHandle),
    pageBody: "",
    allowLiveTheme: opts.allowLiveTheme ?? false,
  });
}

// ---------------------------------------------------------------------------
// Store management assistant (tool use). Read tools inspect the live store;
// "propose_*" tools only create DRAFT change requests the user must approve.
// ---------------------------------------------------------------------------

const ASSISTANT_SYSTEM = `${HONESTY_RULES}

You are the operator's Shopify store management assistant.
- ALWAYS inspect the current store with the read tools before proposing a change (e.g. fetch the product before changing its price; read the theme's templates/index.json before proposing homepage changes).
- You cannot apply changes. The propose_* tools create DRAFT change requests with a preview; the operator reviews and explicitly approves them in Store Builder → Changes. Say so clearly after proposing.
- Products are always created as DRAFT. Never claim something was published, deleted or changed.
- Prefer targeting an unpublished theme copy for theme work; say when a request would affect the live theme.
- The Admin API cannot change every theme setting; when a request needs the theme editor, explain the manual steps instead.
- ${STORE_RULES}
- Keep replies short: what you looked at, what you propose (with change-request titles), and what the operator should review.`;

export async function runStoreAssistant(userId: string, conversationId: string, message: string) {
  const client = getAnthropic();
  const { spent, budget } = await monthToDateSpend(userId);
  if (budget !== null && spent >= budget) throw new AiUnavailableError("budget_exceeded", `Monthly AI budget reached ($${spent.toFixed(2)} of $${budget.toFixed(2)}).`);
  const model = await userModel(userId);
  const history = await withUser(userId, (db) => db<{ role: "user" | "assistant"; content: { text: string } }[]>`
    select role, content from public.ai_messages where conversation_id = ${conversationId} order by id desc limit 20`);
  const created: Array<{ id: string; title: string }> = [];
  let connectedCache: Awaited<ReturnType<typeof getConnection>> | null = null;
  const conn = async () => (connectedCache ??= await getConnection(userId));
  const json = (v: unknown) => JSON.stringify(v).slice(0, 60_000);
  const safe = (fn: () => Promise<string>) => async () => {
    try {
      return await fn();
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  };
  const propose = async (kind: keyof typeof PAYLOADS, title: string, summary: string, payload: unknown, productId?: string | null) => {
    const r = await createChangeRequest(userId, { kind, title, summary, payload, productId: productId ?? null, createdBy: "ai" });
    created.push({ id: r.id, title });
    return `Draft change request created (id ${r.id}). ${r.previewError ? `Preview could not be generated: ${r.previewError}` : "Preview stored."} The operator must review and approve it.`;
  };

  const tools = [
    betaZodTool({ name: "list_shopify_products", description: "List products in the connected Shopify store (most recently updated first). Optional Shopify search query, e.g. 'status:draft' or 'title:*paw*'.", inputSchema: z.object({ query: z.string().optional() }), run: (i) => safe(async () => json(await shopifyGraphql(await conn(), Q.products, { first: 30, query: i.query ?? null })))() }),
    betaZodTool({ name: "get_shopify_product", description: "Get one Shopify product with variants, prices, description and SEO.", inputSchema: z.object({ productGid: z.string() }), run: (i) => safe(async () => json(await shopifyGraphql(await conn(), Q.product, { id: i.productGid })))() }),
    betaZodTool({ name: "list_collections", description: "List collections in the store.", inputSchema: z.object({}), run: () => safe(async () => json(await shopifyGraphql(await conn(), Q.collections)))() }),
    betaZodTool({ name: "list_themes", description: "List themes and their roles (MAIN = live).", inputSchema: z.object({}), run: () => safe(async () => json(await shopifyGraphql(await conn(), Q.themes)))() }),
    betaZodTool({ name: "list_theme_files", description: "List filenames in a theme.", inputSchema: z.object({ themeGid: z.string() }), run: (i) => safe(async () => json(await shopifyGraphql(await conn(), Q.themeFileList, { id: i.themeGid })))() }),
    betaZodTool({ name: "read_theme_files", description: "Read up to 5 text theme files (e.g. templates/index.json, sections/header.liquid).", inputSchema: z.object({ themeGid: z.string(), filenames: z.array(z.string()).max(5) }), run: (i) => safe(async () => json(await shopifyGraphql(await conn(), Q.themeFiles, { id: i.themeGid, filenames: i.filenames })))() }),
    betaZodTool({
      name: "store_sales_summary",
      description: "Sales recorded on the platform (synced from Shopify or entered manually) per research product.",
      inputSchema: z.object({}),
      run: () => safe(async () => json(await withUser(userId, (db) => db`
        select p.name, s.source, sum(s.orders)::int as orders, sum(s.revenue) as revenue, sum(s.refund_count)::int as refunds, min(s.period_start) as from, max(s.period_end) as to
        from public.sales_performance s join public.products p on p.id = s.product_id group by p.name, s.source order by sum(s.revenue) desc`)))(),
    }),
    betaZodTool({ name: "list_research_products", description: "Products in the research platform with scores and stage.", inputSchema: z.object({ q: z.string().optional() }), run: (i) => safe(async () => json((await withUser(userId, (db) => listProducts(db, { q: i.q, limit: 40 }))).map((p) => ({ id: p.id, name: p.name, stage: p.stage, score: p.scoreTotal, confidence: p.scoreConfidence, price: p.estSellingPrice, cost: p.estSupplierCost, is_demo: p.isDemo }))))() }),
    betaZodTool({ name: "get_research_product", description: "Full research record for a product (score, evidence, competitors, suppliers).", inputSchema: z.object({ productId: z.string().uuid() }), run: (i) => safe(async () => json(await withUser(userId, (db) => productBundle(db, i.productId))))() }),
    betaZodTool({
      name: "propose_product_listing",
      description: "Draft a NEW Shopify product (always created as DRAFT). Provide full listing fields.",
      inputSchema: z.object({ researchProductId: z.string().uuid().nullable(), title: z.string(), descriptionHtml: z.string(), productType: z.string(), tags: z.array(z.string()), seoTitle: z.string(), seoDescription: z.string(), price: z.number(), compareAtPrice: z.number().nullable(), cost: z.number().nullable(), optionName: z.string().nullable(), optionValues: z.array(z.string()) }),
      run: (i) => safe(() => propose("product_create", `Create draft product: ${i.title}`, "Proposed by the store assistant", {
        title: i.title, descriptionHtml: i.descriptionHtml, productType: i.productType, tags: i.tags, seo: { title: i.seoTitle, description: i.seoDescription },
        price: i.price, compareAtPrice: i.compareAtPrice, cost: i.cost, option: i.optionName && i.optionValues.length ? { name: i.optionName, values: i.optionValues } : null, researchProductId: i.researchProductId,
      }, i.researchProductId))(),
    }),
    betaZodTool({
      name: "propose_product_update",
      description: "Draft an update to an existing Shopify product's title, description, type, tags or SEO.",
      inputSchema: z.object({ productGid: z.string(), title: z.string().optional(), descriptionHtml: z.string().optional(), productType: z.string().optional(), tags: z.array(z.string()).optional(), seoTitle: z.string().optional(), seoDescription: z.string().optional(), summary: z.string() }),
      run: (i) => safe(() => propose("product_update", `Update product ${i.title ?? i.productGid}`, i.summary, {
        productId: i.productGid, title: i.title, descriptionHtml: i.descriptionHtml, productType: i.productType, tags: i.tags,
        seo: i.seoTitle !== undefined || i.seoDescription !== undefined ? { title: i.seoTitle ?? "", description: i.seoDescription ?? "" } : undefined,
      }))(),
    }),
    betaZodTool({
      name: "propose_price_change",
      description: "Draft a price change for specific variants (fetch the product first to get variant GIDs).",
      inputSchema: z.object({ productGid: z.string(), variants: z.array(z.object({ variantGid: z.string(), price: z.number(), compareAtPrice: z.number().nullable() })), summary: z.string() }),
      run: (i) => safe(() => propose("price_update", `Change price (${i.variants.length} variant${i.variants.length > 1 ? "s" : ""})`, i.summary, { productId: i.productGid, variants: i.variants.map((v) => ({ id: v.variantGid, price: v.price, compareAtPrice: v.compareAtPrice })) }))(),
    }),
    betaZodTool({
      name: "propose_product_status",
      description: "Draft publishing (ACTIVE), unpublishing (DRAFT) or archiving a product.",
      inputSchema: z.object({ productGid: z.string(), status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]), summary: z.string() }),
      run: (i) => safe(() => propose("product_status", `Set product status to ${i.status}`, i.summary, { productId: i.productGid, status: i.status }))(),
    }),
    betaZodTool({
      name: "propose_collection",
      description: "Draft a new collection, optionally with products.",
      inputSchema: z.object({ title: z.string(), descriptionHtml: z.string(), productGids: z.array(z.string()) }),
      run: (i) => safe(() => propose("collection_create", `Create collection: ${i.title}`, "Proposed by the store assistant", { title: i.title, descriptionHtml: i.descriptionHtml, productIds: i.productGids }))(),
    }),
    betaZodTool({
      name: "propose_landing_page",
      description: "Generate and draft a product-specific landing page (new section + page template on the chosen theme + an unpublished page).",
      inputSchema: z.object({ researchProductId: z.string().uuid(), themeGid: z.string(), shopifyProductHandle: z.string().nullable() }),
      run: (i) => safe(async () => {
        const name = (await withUser(userId, (db) => db<{ name: string }[]>`select name from public.products where id = ${i.researchProductId}`))[0]?.name;
        if (!name) return "ERROR: research product not found";
        const { data } = await generateLandingContent(userId, i.researchProductId);
        const payload = landingPayload(data, { themeId: i.themeGid, productName: name, productHandle: i.shopifyProductHandle });
        return propose("landing_page", `Landing page: ${name}`, data.headline, payload, i.researchProductId);
      })(),
    }),
    betaZodTool({
      name: "propose_theme_change",
      description: "Draft new or modified theme files (full file contents). Read existing files first. Prefer adding new sections over rewriting core files.",
      inputSchema: z.object({ themeGid: z.string(), files: z.array(z.object({ filename: z.string(), content: z.string() })).max(10), summary: z.string() }),
      run: (i) => safe(() => propose("theme_files_upsert", `Theme change: ${i.files.map((f) => f.filename).join(", ")}`.slice(0, 300), i.summary, { themeId: i.themeGid, files: i.files }))(),
    }),
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.reverse().map((h) => ({ role: h.role, content: h.content.text })),
    { role: "user", content: message },
  ];
  let finalText = "";
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let servedModel: string = model;
  try {
    const runner = client.beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      thread: false,
      max_iterations: 12,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: ASSISTANT_SYSTEM,
      output_config: { effort: "medium" },
      tools,
      messages,
    });
    for await (const msg of runner) {
      const u = usageFrom(msg.usage);
      totals.inputTokens += u.inputTokens;
      totals.outputTokens += u.outputTokens;
      totals.cacheReadTokens += u.cacheReadTokens;
      totals.cacheWriteTokens += u.cacheWriteTokens;
      servedModel = msg.model ?? servedModel;
      if (msg.stop_reason === "refusal") throw new AiUnavailableError("refused", "The AI declined this request.");
      const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
      if (text) finalText = text;
    }
  } catch (e) {
    if (totals.outputTokens) await recordUsage(userId, "store_assistant", servedModel, totals);
    mapApiError(e);
  }
  const costUsd = await recordUsage(userId, "store_assistant", servedModel, totals);
  const reply = finalText || "I could not produce a reply. Please try again.";
  await withUser(userId, (db) => db`insert into public.ai_messages (user_id, conversation_id, role, content) values
    (${userId}, ${conversationId}, 'user', ${db.json({ text: message })}),
    (${userId}, ${conversationId}, 'assistant', ${db.json({ text: reply, changeRequests: created } as never)})`);
  logger.info("ai.store_assistant", { model: servedModel, costUsd, proposals: created.length });
  return { reply, changeRequests: created, meta: { model: servedModel, costUsd } };
}
