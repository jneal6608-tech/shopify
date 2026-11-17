import "server-only";
import type { Db } from "../db";
import { DEFAULT_ALERT_THRESHOLDS, evaluateAlerts, type AlertCandidate, type AlertThresholds, type ProductState } from "../analytics/alerts";
import type { TrendClass } from "../analytics/trends";
import type { StoredScore } from "./scoring";

export async function thresholdsFor(db: Db, productId: string): Promise<AlertThresholds> {
  const [p] = await db<{ alertThresholds: Partial<AlertThresholds> }[]>`select alert_thresholds from public.user_preferences`;
  const [w] = await db<{ thresholds: Partial<AlertThresholds> }[]>`select thresholds from public.watchlist_items where product_id = ${productId}`;
  return { ...DEFAULT_ALERT_THRESHOLDS, ...(p?.alertThresholds ?? {}), ...(w?.thresholds ?? {}) };
}

async function stateAt(db: Db, productId: string, score: StoredScore): Promise<ProductState> {
  const [ads] = await db<{ value: number }[]>`
    select value from public.trend_observations where product_id = ${productId} and metric = 'meta_active_ads' and collected_at <= ${score.computedAt}
    order by observed_at desc limit 1`;
  const [comp] = await db<{ n: number }[]>`select count(*)::int as n from public.competitors where product_id = ${productId} and created_at <= ${score.computedAt}`;
  const demand = score.components.find((c) => c.key === "demand");
  const growth = demand?.inputs?.growthPct;
  return {
    scoreId: score.id,
    total: score.total,
    trendClass: score.trendClass as TrendClass,
    growthPct: typeof growth === "number" ? growth : null,
    activeAds: ads?.value ?? null,
    trackedCompetitors: comp.n,
  };
}

/** Compares the two latest score snapshots and stores any new alerts (deduplicated). */
export async function evaluateAndStoreAlerts(db: Db, userId: string, productId: string): Promise<AlertCandidate[]> {
  const scores = await db<StoredScore[]>`select * from public.product_scores where product_id = ${productId} order by computed_at desc limit 2`;
  if (scores.length < 2) return [];
  const [p] = await db<{ name: string }[]>`select name from public.products where id = ${productId}`;
  const cur = await stateAt(db, productId, scores[0]);
  const prev = await stateAt(db, productId, scores[1]);
  const candidates = evaluateAlerts(productId, p.name, prev, cur, await thresholdsFor(db, productId));
  const stored: AlertCandidate[] = [];
  for (const a of candidates) {
    const r = await db`insert into public.alerts (user_id, product_id, kind, severity, title, message, data, dedupe_key)
      values (${userId}, ${productId}, ${a.kind}, ${a.severity}, ${a.title}, ${a.message}, ${db.json(a.data as never)}, ${a.dedupeKey})
      on conflict (user_id, dedupe_key) do nothing`;
    if (r.count > 0) stored.push(a);
  }
  return stored;
}

export async function createAlert(db: Db, userId: string, a: { productId?: string | null; kind: string; severity?: string; title: string; message: string; dedupeKey: string; data?: unknown }) {
  await db`insert into public.alerts (user_id, product_id, kind, severity, title, message, data, dedupe_key)
    values (${userId}, ${a.productId ?? null}, ${a.kind}, ${a.severity ?? "info"}, ${a.title}, ${a.message}, ${db.json((a.data ?? {}) as never)}, ${a.dedupeKey})
    on conflict (user_id, dedupe_key) do nothing`;
}
