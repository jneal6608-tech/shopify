import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, stableHash } from "@/lib/crypto";
import { redact } from "@/lib/logger";
import { authMode } from "@/lib/env";
import { serpApiTrends } from "@/lib/sources/serpapi-trends";
import { youtubeSource } from "@/lib/sources/youtube";
import { metaAdLibrary } from "@/lib/sources/meta-ads";
import { fetchJson, SourceError } from "@/lib/sources/http";
import { z } from "zod";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crypto", () => {
  it("round-trips and detects tampering", () => {
    const enc = encryptSecret("shpat_secret");
    expect(enc).not.toContain("shpat_secret");
    expect(decryptSecret(enc)).toBe("shpat_secret");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // random IV
  });
  it("hashes stably regardless of key order", () => {
    expect(stableHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
  });
});

describe("environment guards", () => {
  it("refuses local dev auth in production", () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => authMode()).toThrow(/not allowed in production/);
  });
  it("reports unconfigured auth instead of crashing", () => {
    vi.stubEnv("AUTH_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    delete process.env.AUTH_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(authMode()).toBe("unconfigured");
  });
});

describe("logger redaction", () => {
  it("redacts secrets recursively", () => {
    const r = redact({ accessToken: "abc", nested: { api_key: "k", ok: 1 }, list: [{ password: "p" }] }) as Record<string, any>;
    expect(r.accessToken).toBe("[redacted]");
    expect(r.nested.api_key).toBe("[redacted]");
    expect(r.nested.ok).toBe(1);
    expect(r.list[0].password).toBe("[redacted]");
  });
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("fetchJson", () => {
  it("retries 5xx and validates schema", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", f);
    expect(await fetchJson("t", "https://x.test", z.object({ ok: z.boolean() }))).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry 4xx and rejects invalid shapes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "bad key" } }, 403)));
    await expect(fetchJson("t", "https://x.test", z.object({}))).rejects.toThrow(/bad key/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ unexpected: 1 })));
    await expect(fetchJson("t", "https://x.test", z.object({ ok: z.boolean() }))).rejects.toBeInstanceOf(SourceError);
  });
});

describe("source adapters (mocked providers)", () => {
  it("SerpApi Google Trends → weekly search_interest observations", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ interest_over_time: { timeline_data: [
      { date: "Nov 2 – 8, 2025", timestamp: "1762041600", values: [{ query: "paw", value: "40", extracted_value: 40 }] },
      { date: "Nov 9 – 15, 2025", timestamp: "1762646400", values: [{ query: "paw", value: "<1", extracted_value: 0 }] },
    ] } })));
    const obs = await serpApiTrends.collect("paw");
    expect(obs).toHaveLength(2);
    expect(obs[0]).toMatchObject({ metric: "search_interest", value: 40, sourceKey: "google_trends_serpapi" });
    expect(new Date(obs[0].observedAt).toISOString()).toBe("2025-11-02T00:00:00.000Z");
  });
  it("SerpApi errors surface as SourceError (no fabricated values)", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "Google Trends hasn't returned any results for this query." })));
    await expect(serpApiTrends.collect("zzzz")).rejects.toThrow(/any results/);
  });
  it("YouTube → sample-based recent short-video metrics", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ items: [{ id: { videoId: "a" }, snippet: { publishedAt: "2026-11-01T00:00:00Z", channelId: "c1" } }, { id: { videoId: "b" }, snippet: { publishedAt: "2026-11-02T00:00:00Z", channelId: "c1" } }] }))
      .mockResolvedValueOnce(json({ items: [{ id: "a", statistics: { viewCount: "1000" } }, { id: "b", statistics: { viewCount: "500" } }] })));
    const obs = await youtubeSource.collect("paw");
    expect(Object.fromEntries(obs.map((o) => [o.metric, o.value]))).toEqual({ youtube_recent_videos: 2, youtube_recent_views: 1500, youtube_channel_count: 1 });
  });
  it("Meta Ad Library → paginated active-ad counts", async () => {
    vi.stubEnv("META_AD_LIBRARY_ACCESS_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "1", page_id: "p1" }, { id: "2", page_id: "p2" }], paging: { next: "https://graph.facebook.com/next" } }))
      .mockResolvedValueOnce(json({ data: [{ id: "3", page_id: "p1" }] })));
    const obs = await metaAdLibrary.collect("paw");
    expect(Object.fromEntries(obs.map((o) => [o.metric, o.value]))).toEqual({ meta_active_ads: 3, meta_advertiser_count: 2 });
  });
  it("reports not configured without calling the network", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    delete process.env.SERPAPI_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(serpApiTrends.configured()).toBe(false);
    await expect(serpApiTrends.collect("x")).rejects.toThrow(/not configured/);
    expect(f).not.toHaveBeenCalled();
  });
});
