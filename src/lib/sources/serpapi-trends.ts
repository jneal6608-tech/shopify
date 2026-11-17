import "server-only";
import { z } from "zod";
import { env } from "../env";
import { fetchJson, SourceError } from "./http";
import type { NewObservation } from "../services/observations";

const timeseriesSchema = z.object({
  error: z.string().optional(),
  interest_over_time: z
    .object({
      timeline_data: z.array(
        z.object({
          date: z.string(),
          timestamp: z.string(),
          values: z.array(z.object({ query: z.string().optional(), value: z.string().optional(), extracted_value: z.number() })),
        }),
      ),
    })
    .optional(),
});

const relatedSchema = z.object({
  error: z.string().optional(),
  related_queries: z
    .object({
      rising: z.array(z.object({ query: z.string(), value: z.string().optional(), extracted_value: z.number().optional() })).optional(),
      top: z.array(z.object({ query: z.string(), value: z.string().optional(), extracted_value: z.number().optional() })).optional(),
    })
    .optional(),
});

export const serpApiTrends = {
  key: "google_trends_serpapi",
  name: "Google Trends (via SerpApi)",
  configured: () => Boolean(env().SERPAPI_API_KEY),
  setupHelp:
    "Create a SerpApi account (serpapi.com), copy the API key and set SERPAPI_API_KEY on the server. Each collection uses one search credit. Alternative without credentials: export a CSV from trends.google.com and import it on the product's Trends tab.",

  /** Weekly interest over the past 12 months (or 5 years for longevity). */
  async collect(query: string, geo = "US", range: "today 12-m" | "today 5-y" = "today 12-m"): Promise<NewObservation[]> {
    const key = env().SERPAPI_API_KEY;
    if (!key) throw new SourceError(this.key, "SERPAPI_API_KEY is not configured");
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({ engine: "google_trends", q: query, data_type: "TIMESERIES", date: range, geo, api_key: key }).toString();
    const data = await fetchJson(this.key, url.toString(), timeseriesSchema, { timeoutMs: 45_000 });
    if (data.error) throw new SourceError(this.key, data.error);
    const timeline = data.interest_over_time?.timeline_data ?? [];
    if (timeline.length === 0) throw new SourceError(this.key, "Google Trends returned no data for this query (volume may be too low).");
    return timeline.map((t) => ({
      sourceKey: this.key,
      metric: "search_interest",
      query,
      geo,
      observedAt: new Date(Number(t.timestamp) * 1000),
      value: t.values[0]?.extracted_value ?? 0,
      sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}&geo=${geo}`,
      raw: { label: t.date, range },
    }));
  },

  /** Rising related queries — used by scheduled discovery. */
  async rising(seed: string, geo = "US"): Promise<Array<{ query: string; value: string; extracted: number | null }>> {
    const key = env().SERPAPI_API_KEY;
    if (!key) throw new SourceError(this.key, "SERPAPI_API_KEY is not configured");
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({ engine: "google_trends", q: seed, data_type: "RELATED_QUERIES", date: "today 3-m", geo, api_key: key }).toString();
    const data = await fetchJson(this.key, url.toString(), relatedSchema, { timeoutMs: 45_000 });
    if (data.error) throw new SourceError(this.key, data.error);
    return (data.related_queries?.rising ?? []).map((r) => ({ query: r.query, value: r.value ?? "", extracted: r.extracted_value ?? null }));
  },
};
