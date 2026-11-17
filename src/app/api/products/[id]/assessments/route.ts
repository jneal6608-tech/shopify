import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { contentRatingsSchema, longevityRatingsSchema, problemRatingsSchema } from "@/lib/analytics/rubrics";
import { scoreProduct } from "@/lib/services/scoring";
import { uuid } from "@/lib/validation/common";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("content"), ratings: contentRatingsSchema, notes: z.string().max(4000).default("") }),
  z.object({ kind: z.literal("problem"), ratings: problemRatingsSchema, notes: z.string().max(4000).default("") }),
  z.object({ kind: z.literal("longevity"), ratings: longevityRatingsSchema, notes: z.string().max(4000).default("") }),
]);

export const POST = apiHandler({ body }, async ({ db, user, params, body }) => {
  const id = uuid.parse(params.id);
  await db`insert into public.product_assessments (user_id, product_id, kind, ratings, assessed_by, notes)
           values (${user.id}, ${id}, ${body.kind}, ${db.json(body.ratings)}, 'user', ${body.notes})`;
  const s = await scoreProduct(db, user.id, id);
  return { total: s.result.total, confidence: s.result.confidence };
});
