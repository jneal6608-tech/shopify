import "server-only";
import { withService } from "../db";
import { HttpError } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres (works across serverless
 * instances without extra infrastructure).
 */
export async function enforceRateLimit(bucket: string, limit: number, windowSec: number): Promise<void> {
  const count = await withService(async (db) => {
    const [row] = await db<{ count: number }[]>`
      insert into public.rate_limits (bucket, window_start, count)
      values (${bucket}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
      on conflict (bucket, window_start) do update set count = public.rate_limits.count + 1
      returning count`;
    return row.count;
  });
  if (count > limit) throw new HttpError(429, `Rate limit exceeded: max ${limit} requests per ${windowSec}s. Try again shortly.`);
}

export async function pruneRateLimits(): Promise<number> {
  return withService(async (db) => {
    const r = await db`delete from public.rate_limits where window_start < now() - interval '1 day'`;
    return r.count;
  });
}
