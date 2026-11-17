import "server-only";
import type { Db } from "../db";
import { getProduct } from "./products";
import { latestScore } from "./scoring";
import { listObservations } from "./observations";
import { analyzeTrend } from "../analytics/trends";

/**
 * Compact, provenance-labelled snapshot of everything known about a product,
 * used as the AI's only source of facts.
 */
export async function productBundle(db: Db, productId: string) {
  const p = await getProduct(db, productId);
  const score = await latestScore(db, productId);
  const obs = await listObservations(db, productId);
  const groups = new Map<string, typeof obs>();
  for (const o of obs) {
    const k = `${o.metric}|${o.sourceKey}|${o.query}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const series = [...groups.values()].map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    const t = first.metric === "search_interest" ? analyzeTrend(g.map((x) => ({ date: x.observedAt.toISOString(), value: x.value }))) : null;
    return {
      metric: first.metric,
      source: first.sourceName,
      sourceKind: first.isDemo ? "demo" : first.isEstimate ? "estimate" : first.sourceKind,
      query: first.query,
      points: g.length,
      firstObservedAt: first.observedAt.toISOString().slice(0, 10),
      lastObservedAt: last.observedAt.toISOString().slice(0, 10),
      latestValue: last.value,
      firstValue: first.value,
      trend: t ? { classification: t.classification, growthPct: t.growthPct, peak: t.peak, seasonal: t.seasonality.detected } : undefined,
      sourceUrl: last.sourceUrl,
    };
  });
  const competitors = await db`
    select name, url, channel, price, currency, positioning, presentation_notes, description_excerpt, review_count, avg_rating,
           ad_activity, marketing_angles, complaints, observed_at, is_demo
    from public.competitors where product_id = ${productId} order by observed_at desc limit 25`;
  const offers = await db`
    select s.name as supplier, s.platform, s.store_rating, s.store_review_count, s.years_active, s.return_policy,
           o.unit_cost, o.shipping_cost, o.ship_days_min, o.ship_days_max, o.moq, o.variants, o.has_clear_specs,
           o.product_rating, o.product_review_count, o.sample_quality, o.observed_at, o.is_demo
    from public.supplier_offers o join public.suppliers s on s.id = o.supplier_id where o.product_id = ${productId}`;
  const assessments = await db`
    select distinct on (kind) kind, ratings, assessed_by, created_at from public.product_assessments
    where product_id = ${productId} order by kind, created_at desc`;
  const references = await db`
    select platform, url, creator, hook_text, structure_notes, views_observed, likes_observed, comments_observed, observed_at, is_demo
    from public.reference_videos where product_id = ${productId} order by observed_at desc limit 30`;
  return {
    product: {
      id: p.id,
      name: p.name,
      category: p.categoryName,
      niche: p.niche,
      description: p.description,
      problemSolved: p.problemSolved,
      targetCustomer: p.targetCustomer,
      keywords: p.keywords,
      estimates: { supplierCost: p.estSupplierCost, shippingCost: p.estShippingCost, sellingPrice: p.estSellingPrice, basis: "user estimate" },
      weightGrams: p.weightGrams,
      isFragile: p.isFragile,
      stage: p.stage,
      is_demo: p.isDemo,
    },
    deterministicScore: score
      ? {
          computedAt: score.computedAt.toISOString(),
          formulaVersion: score.formulaVersion,
          opportunity: score.total,
          confidence: score.confidence,
          recommendation: score.recommendation,
          trendClass: score.trendClass,
          components: score.components.map((c) => ({ key: c.key, label: c.label, score: c.score, weight: c.weight, basis: c.basis, explanation: c.explanation })),
          missing: score.missing,
          reasons: score.reasons,
        }
      : null,
    observationSeries: series,
    competitors,
    supplierOffers: offers,
    assessments,
    referenceVideos: references,
  };
}
