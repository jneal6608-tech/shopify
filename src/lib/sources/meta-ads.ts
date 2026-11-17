import "server-only";
import { z } from "zod";
import { env } from "../env";
import { fetchJson, SourceError, startOfUtcDay } from "./http";
import type { NewObservation } from "../services/observations";

const pageSchema = z.object({
  data: z.array(z.object({ id: z.string(), page_id: z.string().optional(), page_name: z.string().optional() })),
  paging: z.object({ next: z.string().optional() }).optional(),
});

const MAX_PAGES = 10; // up to 1,000 ads per collection — counts are capped there

export const metaAdLibrary = {
  key: "meta_ad_library",
  name: "Meta Ad Library API",
  configured: () => Boolean(env().META_AD_LIBRARY_ACCESS_TOKEN),
  setupHelp:
    "Confirm your identity at facebook.com/ID, create a Meta developer app, then generate a user access token with the ads_read permission and set META_AD_LIBRARY_ACCESS_TOKEN. Limitation: outside the EU/UK the API only returns political/issue ads, so counts reflect ads delivered in META_AD_REACHED_COUNTRIES (default DE,FR,IT,ES,NL,IE). Tokens expire — refresh them when collection reports an auth error.",

  async collect(query: string): Promise<NewObservation[]> {
    const e = env();
    const token = e.META_AD_LIBRARY_ACCESS_TOKEN;
    if (!token) throw new SourceError(this.key, "META_AD_LIBRARY_ACCESS_TOKEN is not configured");
    const countries = e.META_AD_REACHED_COUNTRIES.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    const u = new URL(`https://graph.facebook.com/${e.META_GRAPH_API_VERSION}/ads_archive`);
    u.search = new URLSearchParams({
      search_terms: query,
      ad_reached_countries: JSON.stringify(countries),
      ad_active_status: "ACTIVE",
      ad_type: "ALL",
      fields: "id,page_id,page_name",
      limit: "100",
      access_token: token,
    }).toString();
    let next: string | undefined = u.toString();
    let count = 0;
    const pages = new Set<string>();
    let capped = false;
    for (let i = 0; next && i < MAX_PAGES; i++) {
      const page: z.infer<typeof pageSchema> = await fetchJson(this.key, next, pageSchema, { timeoutMs: 30_000 });
      count += page.data.length;
      for (const ad of page.data) if (ad.page_id) pages.add(ad.page_id);
      next = page.paging?.next;
      if (i === MAX_PAGES - 1 && next) capped = true;
    }
    const observedAt = startOfUtcDay();
    const sourceUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
    const raw = { countries, capped, cap: MAX_PAGES * 100 };
    return [
      { sourceKey: this.key, metric: "meta_active_ads", query, geo: countries.join(","), observedAt, value: count, sourceUrl, raw },
      { sourceKey: this.key, metric: "meta_advertiser_count", query, geo: countries.join(","), observedAt, value: pages.size, sourceUrl, raw },
    ];
  },
};
