import "server-only";
import { withUser } from "../db";
import { collectForProduct } from "../services/collect";
import { scoreProduct } from "../services/scoring";
import { evaluateAndStoreAlerts } from "../services/alerts";
import { buildDailySummary } from "../services/insights";
import { API_SOURCES } from "../sources/registry";
import { serpApiTrends } from "../sources/serpapi-trends";
import { SourceError } from "../sources/http";
import { aiConfigured } from "../ai/client";
import { runStructured } from "../ai/run";
import { dailySummaryNarrativeSchema } from "../ai/schemas";
import { syncShopifySales } from "../shopify/sync";
import { logger } from "../logger";

export type JobKind =
  | "daily_discovery"
  | "watchlist_monitor"
  | "trend_alerts"
  | "competitor_update"
  | "daily_summary"
  | "weekly_category_report"
  | "weekly_opportunity_report"
  | "shopify_sync";

export interface JobResult {
  status: "succeeded" | "skipped";
  summary: Record<string, unknown>;
}

type Handler = (userId: string, config: Record<string, unknown>) => Promise<JobResult>;
const anyApiConfigured = () => Object.values(API_SOURCES).some((s) => s.configured());

async function rescoreWithAlerts(userId: string, productIds: string[]) {
  let alerts = 0;
  for (const id of productIds) {
    await withUser(userId, async (db) => {
      await scoreProduct(db, userId, id);
      alerts += (await evaluateAndStoreAlerts(db, userId, id)).length;
    });
  }
  return alerts;
}

const watchlistMonitor: Handler = async (userId, config) => {
  const max = Number(config.maxProducts ?? 25);
  const items = await withUser(userId, (db) => db<{ productId: string; isDemo: boolean }[]>`
    select w.product_id, p.is_demo from public.watchlist_items w join public.products p on p.id = w.product_id order by w.created_at limit ${max}`);
  if (items.length === 0) return { status: "skipped", summary: { reason: "Watchlist is empty" } };
  let collected = 0;
  const errors: string[] = [];
  for (const it of items) {
    // Never call external APIs for synthetic demo products.
    if (!it.isDemo && anyApiConfigured()) {
      try {
        const r = await collectForProduct(userId, it.productId);
        collected += r.results.reduce((a, x) => a + x.inserted, 0);
        errors.push(...r.results.filter((x) => x.status === "error").map((x) => `${x.source}: ${x.message}`));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  const alerts = await rescoreWithAlerts(userId, items.map((i) => i.productId));
  return { status: "succeeded", summary: { products: items.length, newObservations: collected, alerts, sourcesConfigured: anyApiConfigured(), errors: errors.slice(0, 10) } };
};

const trendAlerts: Handler = async (userId) => {
  const ids = await withUser(userId, (db) => db<{ id: string }[]>`select id from public.products where stage not in ('archived','discontinued') order by updated_at desc limit 200`);
  const alerts = await rescoreWithAlerts(userId, ids.map((x) => x.id));
  return { status: "succeeded", summary: { products: ids.length, alerts } };
};

const dailyDiscovery: Handler = async (userId, config) => {
  if (!serpApiTrends.configured()) return { status: "skipped", summary: { reason: "SERPAPI_API_KEY not configured — discovery uses Google Trends rising queries via SerpApi." } };
  const maxSeeds = Number(config.maxSeeds ?? 6);
  const { seeds, avoid, existing } = await withUser(userId, async (db) => {
    const [prefs] = await db<{ preferredCategoryIds: string[]; avoidedKeywords: string[] }[]>`select preferred_category_ids, avoided_keywords from public.user_preferences`;
    const cats = await db<{ id: string; seedKeywords: string[] }[]>`
      select id, seed_keywords from public.categories where cardinality(seed_keywords) > 0
        ${prefs?.preferredCategoryIds?.length ? db`and id = any(${prefs.preferredCategoryIds}::uuid[])` : db``}`;
    const names = await db<{ name: string }[]>`select lower(name) as name from public.products`;
    // Rotate seeds day by day so every category is covered over time.
    const all = cats.flatMap((c) => c.seedKeywords.map((k) => ({ categoryId: c.id, seed: k })));
    const day = Math.floor(Date.now() / 86_400_000);
    const rotated = all.length ? Array.from({ length: Math.min(maxSeeds, all.length) }, (_, i) => all[(day * maxSeeds + i) % all.length]) : [];
    return { seeds: rotated, avoid: (prefs?.avoidedKeywords ?? []).map((k) => k.toLowerCase()), existing: new Set(names.map((n) => n.name)) };
  });
  let found = 0;
  let fresh = 0;
  const errors: string[] = [];
  for (const s of seeds) {
    try {
      const rising = await serpApiTrends.rising(s.seed);
      for (const r of rising.slice(0, 10)) {
        const q = r.query.toLowerCase().trim();
        if (!q || avoid.some((a) => q.includes(a)) || existing.has(q)) continue;
        found++;
        const res = await withUser(userId, (db) => db<{ inserted: boolean }[]>`
          insert into public.discovery_candidates (user_id, category_id, query, source_key, evidence)
          values (${userId}, ${s.categoryId}, ${q}, 'google_trends_serpapi', ${db.json({ seed: s.seed, risingValue: r.value, extracted: r.extracted, window: "past 3 months" })})
          on conflict (user_id, query) do update set last_seen_at = now(), evidence = excluded.evidence
          returning (xmax = 0) as inserted`);
        if (res[0]?.inserted) fresh++;
      }
    } catch (e) {
      errors.push(`${s.seed}: ${e instanceof SourceError ? e.message : "error"}`);
    }
  }
  if (errors.length === seeds.length && seeds.length > 0) throw new Error(`All discovery queries failed: ${errors[0]}`);
  return { status: "succeeded", summary: { seeds: seeds.map((s) => s.seed), risingQueries: found, newCandidates: fresh, errors } };
};

const competitorUpdate: Handler = async (userId) => {
  if (!API_SOURCES.meta_ad_library.configured()) return { status: "skipped", summary: { reason: "META_AD_LIBRARY_ACCESS_TOKEN not configured" } };
  const ids = await withUser(userId, (db) => db<{ id: string }[]>`
    select distinct p.id from public.products p join public.competitors c on c.product_id = p.id where not p.is_demo and p.stage not in ('archived','discontinued') limit 25`);
  let inserted = 0;
  for (const { id } of ids) {
    const r = await collectForProduct(userId, id, { sources: ["meta_ad_library"] });
    inserted += r.results.reduce((a, x) => a + x.inserted, 0);
  }
  const alerts = await rescoreWithAlerts(userId, ids.map((x) => x.id));
  return { status: "succeeded", summary: { products: ids.length, newObservations: inserted, alerts } };
};

async function lastReportAt(userId: string, kind: string, fallbackDays: number) {
  const [r] = await withUser(userId, (db) => db<{ createdAt: Date }[]>`select created_at from public.research_reports where kind = ${kind} order by created_at desc limit 1`);
  return r?.createdAt ?? new Date(Date.now() - fallbackDays * 86_400_000);
}

async function narrative(userId: string, feature: string, input: unknown, config: Record<string, unknown>) {
  if (config.aiNarrative === false || !aiConfigured()) return null;
  try {
    const { data, meta } = await runStructured(userId, {
      feature,
      schema: dailySummaryNarrativeSchema,
      effort: "low",
      maxTokens: 8000,
      instructions: "Write a short research briefing from this deterministic summary. Mention only items present in the data; if little changed, say so plainly. Do not repeat items that are absent.",
      input,
    });
    return { ...data, model: meta.model };
  } catch (e) {
    logger.warn("job.narrative_failed", { feature, err: e });
    return null;
  }
}

const dailySummary: Handler = async (userId, config) => {
  const since = await lastReportAt(userId, "daily_summary", 1);
  const summary = await withUser(userId, (db) => buildDailySummary(db, userId, since));
  const story = await narrative(userId, "daily_summary", summary, config);
  await withUser(userId, (db) => db`insert into public.research_reports (user_id, kind, title, model, input_snapshot, output)
    values (${userId}, 'daily_summary', ${`Daily research summary — ${new Date().toISOString().slice(0, 10)}`}, ${story?.model ?? null},
      ${db.json({ since: summary.since })}, ${db.json({ ...(story ? { briefing: { headline: story.headline, narrative: story.narrative, focusToday: story.focusToday } } : {}), ...summary } as never)})`);
  return { status: "succeeded", summary: { newProducts: summary.newProducts.length, increasing: summary.increasing.length, losing: summary.losingMomentum.length, recommended: summary.recommended.length, aiNarrative: Boolean(story) } };
};

const weeklyCategoryReport: Handler = async (userId) => {
  const rows = await withUser(userId, (db) => db`
    select coalesce(category_name, 'Uncategorised') as category, count(*)::int as products,
      round(avg(score_total)::numeric, 1) as avg_score, round(avg(score_confidence)::numeric, 1) as avg_confidence,
      count(*) filter (where trend_class in ('emerging','rapidly_rising'))::int as rising,
      count(*) filter (where trend_class = 'declining')::int as declining,
      count(*) filter (where trend_class = 'insufficient_data' or trend_class is null)::int as insufficient_data,
      (array_agg(name order by score_total desc nulls last))[1:3] as top_products
    from public.product_overview where stage <> 'archived' group by 1 order by avg(score_total) desc nulls last`);
  if (rows.length === 0) return { status: "skipped", summary: { reason: "No products" } };
  await withUser(userId, (db) => db`insert into public.research_reports (user_id, kind, title, model, output)
    values (${userId}, 'weekly_category', ${`Weekly category report — ${new Date().toISOString().slice(0, 10)}`}, null, ${db.json({ categories: rows } as never)})`);
  return { status: "succeeded", summary: { categories: rows.length } };
};

const weeklyOpportunityReport: Handler = async (userId, config) => {
  const top = await withUser(userId, (db) => db`
    select id, name, score_total, score_confidence, recommendation, trend_class, growth_pct, content_score, competition_score, profit_score, is_demo
    from public.product_overview where stage not in ('archived','discontinued') and score_total is not null
    order by score_total * (0.5 + coalesce(score_confidence, 0) / 200.0) desc limit 10`);
  if (top.length === 0) return { status: "skipped", summary: { reason: "No scored products" } };
  const story = await narrative(userId, "weekly_opportunity_report", { topOpportunities: top }, config);
  await withUser(userId, (db) => db`insert into public.research_reports (user_id, kind, title, model, output)
    values (${userId}, 'weekly_opportunity', ${`Weekly opportunity report — ${new Date().toISOString().slice(0, 10)}`}, ${story?.model ?? null},
      ${db.json({ ...(story ? { briefing: { headline: story.headline, narrative: story.narrative } } : {}), topOpportunities: top } as never)})`);
  return { status: "succeeded", summary: { products: top.length } };
};

const shopifySync: Handler = async (userId) => syncShopifySales(userId);

export const HANDLERS: Record<JobKind, Handler> = {
  daily_discovery: dailyDiscovery,
  watchlist_monitor: watchlistMonitor,
  trend_alerts: trendAlerts,
  competitor_update: competitorUpdate,
  daily_summary: dailySummary,
  weekly_category_report: weeklyCategoryReport,
  weekly_opportunity_report: weeklyOpportunityReport,
  shopify_sync: shopifySync,
};

export const JOB_DESCRIPTIONS: Record<JobKind, string> = {
  daily_discovery: "Finds rising Google Trends queries for your category seed keywords (SerpApi) and adds them as discovery candidates.",
  watchlist_monitor: "Collects fresh data for watchlist products from connected sources, rescores them and raises alerts.",
  trend_alerts: "Rescores all active products (no external calls) and raises alerts for trend and score changes.",
  competitor_update: "Refreshes Meta Ad Library counts for products with tracked competitors.",
  daily_summary: "Daily summary: new products, rising and falling interest, category changes, competition changes, and products to investigate (only new evidence).",
  weekly_category_report: "Weekly statistics per category.",
  weekly_opportunity_report: "Weekly top opportunities ranked by evidence-weighted score.",
  shopify_sync: "Imports Shopify orders, revenue and refunds for products linked to Shopify.",
};
