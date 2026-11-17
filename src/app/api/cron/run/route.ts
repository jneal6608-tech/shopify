import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runDueJobs } from "@/lib/jobs/runner";
import { pruneRateLimits } from "@/lib/api/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron entry point. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok = !!secret && auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const ran = await runDueJobs(Number(new URL(req.url).searchParams.get("limit") ?? 10));
    const pruned = await pruneRateLimits();
    return NextResponse.json({ data: { ran, pruned } });
  } catch (err) {
    logger.error("cron.failed", { err });
    return NextResponse.json({ error: { message: "Cron run failed" } }, { status: 500 });
  }
}
