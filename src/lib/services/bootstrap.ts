import "server-only";
import { withUser } from "../db";
import { DEFAULT_WEIGHTS } from "../analytics/weights";

export const DEFAULT_JOBS: Array<{ kind: string; frequency: "daily" | "weekly" }> = [
  { kind: "watchlist_monitor", frequency: "daily" },
  { kind: "trend_alerts", frequency: "daily" },
  { kind: "daily_discovery", frequency: "daily" },
  { kind: "daily_summary", frequency: "daily" },
  { kind: "competitor_update", frequency: "weekly" },
  { kind: "weekly_category_report", frequency: "weekly" },
  { kind: "weekly_opportunity_report", frequency: "weekly" },
  { kind: "shopify_sync", frequency: "daily" },
];

/** Idempotently creates a user's profile, preferences, weights v1 and default jobs. */
export async function bootstrapUser(userId: string, email: string | null): Promise<void> {
  await withUser(userId, async (db) => {
    await db`insert into public.profiles (id, display_name) values (${userId}, ${email ? email.split("@")[0] : null}) on conflict (id) do nothing`;
    await db`insert into public.user_preferences (user_id) values (${userId}) on conflict (user_id) do nothing`;
    await db`
      insert into public.scoring_weight_versions (user_id, version, weights, reason, source, is_active)
      select ${userId}, 1, ${db.json(DEFAULT_WEIGHTS)}, 'Initial default weights from the product brief', 'default', true
      where not exists (select 1 from public.scoring_weight_versions where user_id = ${userId})
      on conflict do nothing`;
    for (const j of DEFAULT_JOBS) {
      await db`
        insert into public.research_jobs (user_id, kind, frequency, enabled, next_run_at)
        values (${userId}, ${j.kind}, ${j.frequency}, true, now() + interval '1 hour')
        on conflict (user_id, kind) do nothing`;
    }
  });
}
