import "server-only";
import type { z } from "zod";
import { logger } from "../logger";

export class SourceError extends Error {
  constructor(
    public source: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/**
 * GET JSON with timeout, bounded retries (429/5xx/network, exponential
 * backoff honouring Retry-After) and schema validation of the response.
 * URLs may contain credentials, so they are never logged.
 */
export async function fetchJson<S extends z.ZodType>(
  source: string,
  url: string,
  schema: S,
  opts: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<z.infer<S>> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", ...opts.headers }, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        lastErr = new SourceError(source, `HTTP ${res.status}`, res.status);
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 500 * 2 ** attempt));
          continue;
        }
        throw lastErr;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new SourceError(source, `Non-JSON response (HTTP ${res.status})`, res.status);
      }
      if (!res.ok) {
        const msg = (json as { error?: { message?: string } | string })?.error;
        throw new SourceError(source, typeof msg === "string" ? msg : msg?.message ?? `HTTP ${res.status}`, res.status);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        logger.warn("source.invalid_response", { source, issues: parsed.error.issues.slice(0, 5) });
        throw new SourceError(source, "Unexpected response format from provider");
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof SourceError && err.status && err.status < 500 && err.status !== 429) throw err;
      if (err instanceof SourceError && !err.status) throw err;
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  if (lastErr instanceof SourceError) throw lastErr;
  throw new SourceError(source, `Request failed: ${(lastErr as Error)?.message ?? "network error"}`);
}

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
