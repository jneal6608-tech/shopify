import "server-only";
import type { Db } from "../db";
import { stableHash } from "../crypto";
import { notFound } from "../api/errors";
import { computeScore, FORMULA_VERSION, type Observation, type ScoreResult, type ScoringInput } from "../analytics/scoring";
import type { SeriesPoint } from "../analytics/trends";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "../analytics/weights";
import { median } from "../analytics/math";
import type { ContentRatings, LongevityRatings, ProblemRatings } from "../analytics/rubrics";
import { listObservations, type ObservationRow } from "./observations";

export async function activeWeights(db: Db, userId: string): Promise<{ id: string | null; version: number; weights: ScoringWeights }> {
  const [w] = await db<{ id: string; version: number; weights: ScoringWeights }[]>`
    select id, version, weights from public.scoring_weight_versions where user_id = ${userId} and is_active limit 1`;
  return w ?? { id: null, version: 0, weights: DEFAULT_WEIGHTS };
}

function toObs(r: ObservationRow): Observation {
  return {
    value: r.value,
    observedAt: r.observedAt.toISOString(),
    sourceKey: r.sourceKey,
    reliability: r.isEstimate ? Math.min(r.reliability, 0.4) : r.reliability,
    isEstimate: r.isEstimate,
    isDemo: r.isDemo,
  };
}

function latest(rows: ObservationRow[], metric: string): Observation | null {
  const m = rows.filter((r) => r.metric === metric);
  return m.length ? toObs(m[m.length - 1]) : null;
}

function series(rows: ObservationRow[], metric: string): SeriesPoint[] {
  return rows.filter((r) => r.metric === metric).map((r) => ({ date: r.observedAt.toISOString(), value: r.value }));
}

/** Picks the single search-interest series (source + query) with the most points. */
function pickSearchSeries(rows: ObservationRow[]) {
  const groups = new Map<string, ObservationRow[]>();
  for (const r of rows.filter((x) => x.metric === "search_interest")) {
    const k = `${r.sourceKey}|${r.query}|${r.geo}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  let best: ObservationRow[] | null = null;
  for (const g of groups.values()) if (!best || g.length > best.length) best = g;
  if (!best) return null;
  return {
    points: best.map((r) => ({ date: r.observedAt.toISOString(), value: r.value })),
    sourceKey: best[0].sourceKey,
    query: best[0].query,
    reliability: best[0].reliability,
    isDemo: best.some((r) => r.isDemo),
  };
}

export async function buildScoringInput(db: Db, userId: string, productId: string, now = new Date()): Promise<ScoringInput> {
  const [p] = await db<{
    estSupplierCost: number | null; estShippingCost: number | null; estSellingPrice: number | null;
    priceBasis: string; weightGrams: number | null; isFragile: boolean | null; updatedAt: Date; isDemo: boolean;
  }[]>`select est_supplier_cost, est_shipping_cost, est_selling_price, price_basis, weight_grams, is_fragile, updated_at, is_demo
       from public.products where id = ${productId}`;
  if (!p) throw notFound("Product");

  const rows = await listObservations(db, productId);
  const search = pickSearchSeries(rows);

  const competitors = await db<{ price: number | null; observedAt: Date }[]>`
    select price, observed_at from public.competitors where product_id = ${productId}`;
  const offers = await db<{ unitCost: number; shippingCost: number | null; shipDaysMax: number | null; observedAt: Date }[]>`
    select unit_cost, shipping_cost, ship_days_max, observed_at from public.supplier_offers where product_id = ${productId}`;
  const assessments = await db<{ kind: string; ratings: unknown; assessedBy: "user" | "ai"; createdAt: Date }[]>`
    select distinct on (kind) kind, ratings, assessed_by, created_at from public.product_assessments
    where product_id = ${productId} order by kind, created_at desc`;
  const [prefs] = await db<{ feeSettings: Record<string, number> }[]>`
    select fee_settings from public.user_preferences where user_id = ${userId}`;

  // Economics: prefer the cheapest landed supplier offer over a manual estimate.
  const bestOffer = [...offers].sort(
    (a, b) => a.unitCost + (a.shippingCost ?? 6) - (b.unitCost + (b.shippingCost ?? 6)),
  )[0];
  let sellingPrice = p.estSellingPrice;
  let priceReliability = 0.5;
  const competitorPrices = competitors.map((c) => c.price).filter((x): x is number => x !== null);
  if (sellingPrice === null && competitorPrices.length >= 2) {
    sellingPrice = median(competitorPrices);
    priceReliability = 0.6;
  }
  const supplierCost = bestOffer ? bestOffer.unitCost : p.estSupplierCost;
  const shippingCost = bestOffer && bestOffer.shippingCost !== null ? bestOffer.shippingCost : p.estShippingCost;
  const econReliability = bestOffer ? Math.min(0.75, priceReliability + 0.2) : priceReliability;

  const a = (k: string) => assessments.find((x) => x.kind === k);
  const mk = <T,>(k: string) => {
    const x = a(k);
    return x ? { ratings: x.ratings as T, assessedBy: x.assessedBy, at: x.createdAt.toISOString() } : null;
  };
  const latestDate = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString() : null);

  return {
    now,
    search: search ? { points: search.points, sourceKey: search.sourceKey, reliability: search.reliability, isDemo: search.isDemo } : null,
    socialSeries: ["youtube_recent_videos", "tiktok_video_count", "tiktok_hashtag_views"]
      .map((m) => ({ metric: m, points: series(rows, m) }))
      .filter((s) => s.points.length >= 2),
    competition: {
      metaActiveAds: latest(rows, "meta_active_ads"),
      metaAdsHistory: series(rows, "meta_active_ads"),
      youtubeRecentVideos: latest(rows, "youtube_recent_videos"),
      amazonTopReviewCount: latest(rows, "amazon_top_review_count"),
      trackedCompetitors: competitors.length,
      competitorsLatestAt: latestDate(competitors.map((c) => c.observedAt)),
    },
    economics: {
      sellingPrice,
      supplierCost,
      shippingCost,
      reliability: econReliability,
      latestAt: bestOffer ? bestOffer.observedAt.toISOString() : p.updatedAt.toISOString(),
      fees: prefs?.feeSettings ?? {},
    },
    assessments: {
      content: mk<ContentRatings>("content"),
      problem: mk<ProblemRatings>("problem"),
      longevity: mk<LongevityRatings>("longevity"),
    },
    shipping: {
      weightGrams: p.weightGrams,
      isFragile: p.isFragile,
      shipDaysMax: bestOffer?.shipDaysMax ?? null,
      shippingCost,
      sellingPrice,
      reliability: bestOffer ? 0.7 : 0.5,
      latestAt: bestOffer ? bestOffer.observedAt.toISOString() : p.updatedAt.toISOString(),
    },
  };
}

export interface StoredScore {
  id: string;
  productId: string;
  total: number;
  confidence: number;
  recommendation: string;
  trendClass: string;
  components: ScoreResult["components"];
  confidenceBreakdown: ScoreResult["confidenceBreakdown"];
  weights: ScoringWeights;
  weightVersionId: string | null;
  formulaVersion: string;
  inputsDigest: string;
  missing: string[];
  reasons: string[];
  isDemo: boolean;
  computedAt: Date;
}

/**
 * Computes and (when inputs, weights or formula changed, or the last score is
 * over 7 days old) stores a new score snapshot. Returns the result.
 */
export async function scoreProduct(db: Db, userId: string, productId: string, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const input = await buildScoringInput(db, userId, productId, now);
  const w = await activeWeights(db, userId);
  const result = computeScore(input, w.weights);
  const { now: _n, ...digestable } = input;
  const digest = stableHash({ digestable, weights: w.weights, formula: FORMULA_VERSION });
  const [prev] = await db<{ id: string; inputsDigest: string; computedAt: Date; total: number }[]>`
    select id, inputs_digest, computed_at, total from public.product_scores where product_id = ${productId}
    order by computed_at desc limit 1`;
  const stale = prev ? now.getTime() - prev.computedAt.getTime() > 7 * 86_400_000 : true;
  const [prod] = await db<{ isDemo: boolean }[]>`select is_demo from public.products where id = ${productId}`;
  if (!opts.force && prev && prev.inputsDigest === digest && !stale) {
    return { result, scoreId: prev.id, stored: false, previousTotal: prev.total };
  }
  const [row] = await db<{ id: string }[]>`
    insert into public.product_scores (user_id, product_id, total, confidence, recommendation, trend_class, components,
      confidence_breakdown, weights, weight_version_id, formula_version, inputs_digest, missing, reasons, is_demo, computed_at)
    values (${userId}, ${productId}, ${result.total}, ${result.confidence}, ${result.recommendation}, ${result.trend.classification},
      ${db.json(result.components as never)}, ${db.json(result.confidenceBreakdown as never)}, ${db.json(w.weights)}, ${w.id},
      ${result.formulaVersion}, ${digest}, ${result.missing}, ${result.reasons}, ${prod?.isDemo ?? false}, ${now})
    returning id`;
  return { result, scoreId: row.id, stored: true, previousTotal: prev?.total ?? null };
}

export async function scoreHistory(db: Db, productId: string): Promise<StoredScore[]> {
  return db<StoredScore[]>`select * from public.product_scores where product_id = ${productId} order by computed_at desc limit 100`;
}

export async function latestScore(db: Db, productId: string): Promise<StoredScore | null> {
  const [s] = await db<StoredScore[]>`select * from public.product_scores where product_id = ${productId} order by computed_at desc limit 1`;
  return s ?? null;
}
