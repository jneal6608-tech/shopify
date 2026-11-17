import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { runJobNow } from "@/lib/jobs/runner";

export const maxDuration = 300;

export const POST = apiHandler(
  { body: z.object({ kind: z.enum(["daily_discovery", "watchlist_monitor", "trend_alerts", "competitor_update", "daily_summary", "weekly_category_report", "weekly_opportunity_report", "shopify_sync"]) }), rateLimit: { bucket: "jobs:run", limit: 20, windowSec: 600 }, noTransaction: true },
  async ({ user, body }) => runJobNow(user.id, body.kind),
);
