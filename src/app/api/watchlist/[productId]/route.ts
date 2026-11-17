import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { thresholdsSchema } from "@/lib/validation/records";

export const PATCH = apiHandler({ body: z.object({ thresholds: thresholdsSchema.optional(), notes: z.string().max(2000).optional() }) }, async ({ db, params, body }) => {
  const id = uuid.parse(params.productId);
  if (body.thresholds) await db`update public.watchlist_items set thresholds = ${db.json(body.thresholds)} where product_id = ${id}`;
  if (body.notes !== undefined) await db`update public.watchlist_items set notes = ${body.notes} where product_id = ${id}`;
  return { ok: true };
});

export const DELETE = apiHandler({}, async ({ db, params }) => {
  await db`delete from public.watchlist_items where product_id = ${uuid.parse(params.productId)}`;
  return { ok: true };
});
