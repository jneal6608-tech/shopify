import "server-only";
import { withUser } from "../db";
import { API_SOURCES, type ApiSourceKey } from "../sources/registry";
import { SourceError } from "../sources/http";
import { insertObservations } from "./observations";
import { scoreProduct } from "./scoring";
import { logger } from "../logger";

export interface CollectResult {
  source: string;
  status: "ok" | "not_configured" | "error";
  inserted: number;
  skipped: number;
  message?: string;
}

/**
 * Collects fresh observations for a product from the configured API sources.
 * Network calls happen outside any DB transaction; each source fails
 * independently and reports why.
 */
export async function collectForProduct(
  userId: string,
  productId: string,
  opts: { sources?: ApiSourceKey[]; query?: string } = {},
): Promise<{ results: CollectResult[]; score: { total: number; confidence: number } }> {
  const product = await withUser(userId, async (db) => {
    const [p] = await db<{ name: string; keywords: string[]; isDemo: boolean }[]>`select name, keywords, is_demo from public.products where id = ${productId}`;
    return p;
  });
  if (!product) throw new Error("Product not found");
  const query = (opts.query?.trim() || product.keywords[0] || product.name).slice(0, 100);
  const keys = opts.sources ?? (Object.keys(API_SOURCES) as ApiSourceKey[]);
  const results: CollectResult[] = [];
  for (const key of keys) {
    const src = API_SOURCES[key];
    if (!src.configured()) {
      results.push({ source: key, status: "not_configured", inserted: 0, skipped: 0, message: src.setupHelp });
      continue;
    }
    try {
      const obs = await src.collect(query);
      const r = await withUser(userId, (db) => insertObservations(db, userId, productId, obs));
      results.push({ source: key, status: "ok", ...r });
    } catch (err) {
      const message = err instanceof SourceError ? err.message : "Unexpected error while collecting";
      logger.warn("collect.failed", { source: key, productId, err });
      results.push({ source: key, status: "error", inserted: 0, skipped: 0, message });
    }
  }
  const s = await withUser(userId, (db) => scoreProduct(db, userId, productId));
  return { results, score: { total: s.result.total, confidence: s.result.confidence } };
}
