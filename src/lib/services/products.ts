import "server-only";
import type { Db } from "../db";
import { notFound } from "../api/errors";
import type { ProductFilters, ProductInput } from "../validation/products";
import type { Stage } from "../validation/common";

export interface ProductOverview {
  id: string;
  userId: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  niche: string | null;
  targetCustomer: string;
  problemSolved: string;
  keywords: string[];
  estSupplierCost: number | null;
  estShippingCost: number | null;
  estSellingPrice: number | null;
  priceBasis: string;
  weightGrams: number | null;
  isFragile: boolean | null;
  stage: Stage;
  isBookmarked: boolean;
  discoverySource: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  scoreId: string | null;
  scoreTotal: number | null;
  scoreConfidence: number | null;
  recommendation: string | null;
  trendClass: string | null;
  scoredAt: Date | null;
  demandScore: number | null;
  contentScore: number | null;
  profitScore: number | null;
  competitionScore: number | null;
  growthPct: number | null;
  estGrossMarginPct: number | null;
  onWatchlist: boolean;
}

export async function listProducts(db: Db, f: Partial<ProductFilters> = {}): Promise<ProductOverview[]> {
  const e = db``;
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const order = {
    opportunity: db`score_total desc nulls last, created_at desc`,
    newest: db`created_at desc`,
    rising: db`growth_pct desc nulls last, score_total desc nulls last`,
    declining: db`growth_pct asc nulls last, score_total desc nulls last`,
    confidence: db`score_confidence desc nulls last`,
  }[f.sort ?? "opportunity"];
  const direction =
    f.direction === "up"
      ? db`and trend_class in ('emerging','rapidly_rising')`
      : f.direction
        ? db`and trend_class = ${f.direction}`
        : e;
  return db<ProductOverview[]>`
    select * from public.product_overview
    where true
      ${f.includeArchived === "1" || f.stage === "archived" ? e : db`and stage <> 'archived'`}
      ${like ? db`and (name ilike ${like} or description ilike ${like} or niche ilike ${like} or problem_solved ilike ${like} or ${f.q!.toLowerCase()} = any(keywords))` : e}
      ${f.category ? db`and category_slug = ${f.category}` : e}
      ${f.niche ? db`and niche ilike ${"%" + f.niche + "%"}` : e}
      ${f.minPrice !== undefined ? db`and est_selling_price >= ${f.minPrice}` : e}
      ${f.maxPrice !== undefined ? db`and est_selling_price <= ${f.maxPrice}` : e}
      ${f.minCost !== undefined ? db`and est_supplier_cost >= ${f.minCost}` : e}
      ${f.maxCost !== undefined ? db`and est_supplier_cost <= ${f.maxCost}` : e}
      ${f.minMargin !== undefined ? db`and est_gross_margin_pct >= ${f.minMargin}` : e}
      ${f.minCompetition !== undefined ? db`and competition_score >= ${f.minCompetition}` : e}
      ${f.minContent !== undefined ? db`and content_score >= ${f.minContent}` : e}
      ${f.minGrowth !== undefined ? db`and growth_pct >= ${f.minGrowth}` : e}
      ${f.minScore !== undefined ? db`and score_total >= ${f.minScore}` : e}
      ${f.stage ? db`and stage = ${f.stage}` : e}
      ${f.bookmarked === "1" ? db`and is_bookmarked` : e}
      ${direction}
    order by ${order}
    limit ${f.limit ?? 60}`;
}

export async function getProduct(db: Db, id: string): Promise<ProductOverview> {
  const [p] = await db<ProductOverview[]>`select * from public.product_overview where id = ${id}`;
  if (!p) throw notFound("Product");
  return p;
}

export async function getProductsByIds(db: Db, ids: string[]): Promise<ProductOverview[]> {
  if (ids.length === 0) return [];
  return db<ProductOverview[]>`select * from public.product_overview where id = any(${ids}::uuid[])`;
}

function columns(input: Partial<ProductInput>) {
  const map: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) map[k] = v;
  };
  set("name", input.name);
  set("description", input.description);
  set("category_id", input.categoryId);
  set("image_url", input.imageUrl);
  set("niche", input.niche);
  set("target_customer", input.targetCustomer);
  set("problem_solved", input.problemSolved);
  set("keywords", input.keywords);
  set("est_supplier_cost", input.estSupplierCost);
  set("est_shipping_cost", input.estShippingCost);
  set("est_selling_price", input.estSellingPrice);
  set("weight_grams", input.weightGrams);
  set("is_fragile", input.isFragile);
  set("discovery_source", input.discoverySource);
  return map;
}

export async function createProduct(db: Db, userId: string, input: ProductInput, opts: { isDemo?: boolean } = {}) {
  const cols = { ...columns(input), user_id: userId, is_demo: opts.isDemo ?? false };
  const [row] = await db<{ id: string }[]>`insert into public.products ${db(cols as Record<string, string>)} returning id`;
  await db`insert into public.product_stage_events (user_id, product_id, from_stage, to_stage, reason)
           values (${userId}, ${row.id}, null, 'discovered', 'Created')`;
  return row.id;
}

export async function updateProduct(db: Db, id: string, input: Partial<ProductInput>) {
  const cols = columns(input);
  if (Object.keys(cols).length === 0) return;
  const r = await db`update public.products set ${db(cols as Record<string, string>)} where id = ${id}`;
  if (r.count === 0) throw notFound("Product");
}

export async function setStage(db: Db, userId: string, id: string, stage: Stage, reason?: string) {
  const [p] = await db<{ stage: Stage }[]>`select stage from public.products where id = ${id} for update`;
  if (!p) throw notFound("Product");
  if (p.stage === stage) return { changed: false };
  await db`update public.products set stage = ${stage} where id = ${id}`;
  await db`insert into public.product_stage_events (user_id, product_id, from_stage, to_stage, reason)
           values (${userId}, ${id}, ${p.stage}, ${stage}, ${reason ?? null})`;
  return { changed: true, from: p.stage };
}

export async function setBookmark(db: Db, id: string, value: boolean) {
  const r = await db`update public.products set is_bookmarked = ${value} where id = ${id}`;
  if (r.count === 0) throw notFound("Product");
}

export async function deleteProduct(db: Db, id: string) {
  const r = await db`delete from public.products where id = ${id}`;
  if (r.count === 0) throw notFound("Product");
}

export async function stageHistory(db: Db, productId: string) {
  return db<{ fromStage: string | null; toStage: string; reason: string | null; createdAt: Date }[]>`
    select from_stage, to_stage, reason, created_at from public.product_stage_events
    where product_id = ${productId} order by created_at desc limit 50`;
}

export async function listCategories(db: Db) {
  return db<{ id: string; userId: string | null; name: string; slug: string; description: string; seedKeywords: string[]; productCount: number; avgScore: number | null; risingCount: number }[]>`
    select c.id, c.user_id, c.name, c.slug, c.description, c.seed_keywords,
      count(p.id)::int as product_count,
      round(avg(p.score_total)::numeric, 1) as avg_score,
      count(*) filter (where p.trend_class in ('emerging','rapidly_rising'))::int as rising_count
    from public.categories c
    left join public.product_overview p on p.category_id = c.id and p.stage <> 'archived'
    group by c.id
    order by c.user_id nulls first, c.name`;
}

export async function createCategory(db: Db, userId: string, name: string, description: string, seedKeywords: string[]) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "category";
  const [row] = await db<{ id: string; slug: string }[]>`
    insert into public.categories (user_id, name, slug, description, seed_keywords)
    values (${userId}, ${name}, ${slug}, ${description}, ${seedKeywords}) returning id, slug`;
  return row;
}
