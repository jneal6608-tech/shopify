import "server-only";
import { z } from "zod";
import type { Db } from "../db";
import { badRequest } from "../api/errors";

export const METRICS = {
  search_interest: { label: "Search interest (0–100 index)", unit: "index", kind: "demand" },
  youtube_recent_videos: { label: "Recent YouTube Shorts (sample of 50)", unit: "videos", kind: "social" },
  youtube_recent_views: { label: "Views on recent YouTube Shorts (sample)", unit: "views", kind: "social" },
  youtube_channel_count: { label: "Distinct channels posting (sample)", unit: "channels", kind: "social" },
  tiktok_video_count: { label: "TikTok videos (Creative Center)", unit: "videos", kind: "social" },
  tiktok_hashtag_views: { label: "TikTok hashtag views (Creative Center)", unit: "views", kind: "social" },
  meta_active_ads: { label: "Active Meta ads (EU-delivered)", unit: "ads", kind: "competition" },
  meta_advertiser_count: { label: "Distinct Meta advertisers (EU-delivered)", unit: "pages", kind: "competition" },
  amazon_top_review_count: { label: "Amazon top-listing review count", unit: "reviews", kind: "competition" },
  amazon_bsr: { label: "Amazon best-seller rank", unit: "rank", kind: "marketplace" },
  amazon_price: { label: "Amazon price", unit: "USD", kind: "marketplace" },
} as const;
export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as [MetricKey, ...MetricKey[]];

export interface ObservationRow {
  id: number;
  productId: string;
  sourceKey: string;
  metric: string;
  query: string;
  geo: string;
  observedAt: Date;
  value: number;
  isEstimate: boolean;
  isDemo: boolean;
  sourceUrl: string | null;
  collectedAt: Date;
  reliability: number;
  sourceName: string;
  sourceKind: string;
}

export interface NewObservation {
  sourceKey: string;
  metric: string;
  query?: string;
  geo?: string;
  observedAt: string | Date;
  value: number;
  isEstimate?: boolean;
  isDemo?: boolean;
  sourceUrl?: string | null;
  raw?: unknown;
}

/** Appends observations; duplicates (same source/metric/query/geo/date) are skipped. */
export async function insertObservations(db: Db, userId: string, productId: string, obs: NewObservation[]) {
  if (obs.length === 0) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  // Chunk to keep statements small.
  for (let i = 0; i < obs.length; i += 500) {
    const rows = obs.slice(i, i + 500).map((o) => {
      if (!Number.isFinite(o.value)) throw badRequest(`Invalid value for ${o.metric}`);
      return {
        user_id: userId,
        product_id: productId,
        source_key: o.sourceKey,
        metric: o.metric,
        query: (o.query ?? "").slice(0, 300),
        geo: o.geo ?? "US",
        observed_at: new Date(o.observedAt),
        value: o.value,
        is_estimate: o.isEstimate ?? false,
        is_demo: o.isDemo ?? false,
        source_url: o.sourceUrl ?? null,
        raw: (o.raw ?? null) as never,
      };
    });
    const r = await db`insert into public.trend_observations ${db(rows)}
      on conflict (product_id, source_key, metric, query, geo, observed_at) do nothing`;
    inserted += r.count;
  }
  return { inserted, skipped: obs.length - inserted };
}

export async function listObservations(db: Db, productId: string, metric?: string): Promise<ObservationRow[]> {
  return db<ObservationRow[]>`
    select o.id, o.product_id, o.source_key, o.metric, o.query, o.geo, o.observed_at, o.value, o.is_estimate,
           o.is_demo, o.source_url, o.collected_at, s.reliability, s.name as source_name, s.kind as source_kind
    from public.trend_observations o join public.data_sources s on s.key = o.source_key
    where o.product_id = ${productId} ${metric ? db`and o.metric = ${metric}` : db``}
    order by o.observed_at asc`;
}

export async function deleteObservation(db: Db, id: number) {
  await db`delete from public.trend_observations where id = ${id}`;
}

const MANUAL_SOURCES = ["tiktok_creative_center_manual", "amazon_manual", "manual"] as const;
export const manualObservationSchema = z.object({
  sourceKey: z.enum(MANUAL_SOURCES),
  metric: z.enum(METRIC_KEYS),
  value: z.coerce.number().finite().min(0),
  observedAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86_400_000, "Date cannot be in the future"),
  query: z.string().trim().max(300).default(""),
  geo: z.string().trim().max(20).default("US"),
  sourceUrl: z.string().trim().url().refine((u) => /^https?:\/\//.test(u), "http(s) URL required"),
  isEstimate: z.boolean().default(false),
});

export async function listDataSources(db: Db) {
  return db<{ key: string; name: string; kind: string; reliability: number; requiresCredentials: boolean; description: string; docsUrl: string | null }[]>`
    select * from public.data_sources order by kind, name`;
}
