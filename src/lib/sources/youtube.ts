import "server-only";
import { z } from "zod";
import { env } from "../env";
import { fetchJson, SourceError, startOfUtcDay } from "./http";
import type { NewObservation } from "../services/observations";

const searchSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }), snippet: z.object({ publishedAt: z.string(), channelId: z.string() }) })),
  pageInfo: z.object({ totalResults: z.number().optional() }).optional(),
});
const videosSchema = z.object({
  items: z.array(z.object({ id: z.string(), statistics: z.object({ viewCount: z.string().optional() }).optional() })),
});

export const youtubeSource = {
  key: "youtube_data_api",
  name: "YouTube Data API v3",
  configured: () => Boolean(env().YOUTUBE_API_KEY),
  setupHelp:
    "In Google Cloud Console create a project, enable “YouTube Data API v3”, create an API key (restrict it to that API) and set YOUTUBE_API_KEY. The default quota (10,000 units/day) allows ~95 collections per day (search = 100 units).",

  /**
   * Samples up to 50 short videos published in the last 30 days for a query.
   * Metrics are sample-based (top 50 search results), not platform totals.
   */
  async collect(query: string): Promise<NewObservation[]> {
    const key = env().YOUTUBE_API_KEY;
    if (!key) throw new SourceError(this.key, "YOUTUBE_API_KEY is not configured");
    const after = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const s = new URL("https://www.googleapis.com/youtube/v3/search");
    s.search = new URLSearchParams({ part: "snippet", q: query, type: "video", videoDuration: "short", publishedAfter: after, maxResults: "50", order: "relevance", key }).toString();
    const search = await fetchJson(this.key, s.toString(), searchSchema);
    const ids = search.items.map((i) => i.id.videoId).filter((x): x is string => !!x);
    let views = 0;
    if (ids.length) {
      const v = new URL("https://www.googleapis.com/youtube/v3/videos");
      v.search = new URLSearchParams({ part: "statistics", id: ids.join(","), key }).toString();
      const vids = await fetchJson(this.key, v.toString(), videosSchema);
      views = vids.items.reduce((a, x) => a + Number(x.statistics?.viewCount ?? 0), 0);
    }
    const channels = new Set(search.items.map((i) => i.snippet.channelId)).size;
    const observedAt = startOfUtcDay();
    const sourceUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIYAQ%253D%253D`;
    const raw = { sampleSize: ids.length, window: "30d", note: "sample of top 50 search results" };
    return [
      { sourceKey: this.key, metric: "youtube_recent_videos", query, observedAt, value: ids.length, sourceUrl, raw },
      { sourceKey: this.key, metric: "youtube_recent_views", query, observedAt, value: views, sourceUrl, raw },
      { sourceKey: this.key, metric: "youtube_channel_count", query, observedAt, value: channels, sourceUrl, raw },
    ];
  },
};
