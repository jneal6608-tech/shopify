import { apiHandler } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { performanceSchema } from "@/lib/validation/records";

export const POST = apiHandler({ body: performanceSchema }, async ({ db, user, params, body }) => {
  const videoId = uuid.parse(params.id);
  // Metrics are cumulative: warn when a new snapshot is lower than the previous one.
  const [prev] = await db<{ views: number; capturedAt: Date }[]>`select views, captured_at from public.video_performance where video_id = ${videoId} and captured_at < ${body.capturedAt} order by captured_at desc limit 1`;
  if (prev && body.views < prev.views) throw badRequest(`Views (${body.views}) are lower than the previous snapshot (${prev.views}). Metrics are cumulative totals.`);
  await db`insert into public.video_performance ${db({ ...body, userId: user.id, videoId, source: "manual" } as never)}
    on conflict (video_id, captured_at) do update set views = excluded.views, likes = excluded.likes, comments = excluded.comments,
      shares = excluded.shares, saves = excluded.saves, profile_visits = excluded.profile_visits, link_clicks = excluded.link_clicks`;
  return { ok: true };
});
