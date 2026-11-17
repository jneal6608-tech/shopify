import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { latestScore } from "@/lib/services/scoring";
import { thresholdsSchema } from "@/lib/validation/records";

export const POST = apiHandler({ body: z.object({ productId: z.string().uuid(), thresholds: thresholdsSchema.default({}), notes: z.string().max(2000).default("") }) }, async ({ db, user, body }) => {
  const s = await latestScore(db, body.productId);
  await db`insert into public.watchlist_items (user_id, product_id, thresholds, baseline_score, notes)
    values (${user.id}, ${body.productId}, ${db.json(body.thresholds)}, ${s?.total ?? null}, ${body.notes})
    on conflict (user_id, product_id) do nothing`;
  return { ok: true };
});
