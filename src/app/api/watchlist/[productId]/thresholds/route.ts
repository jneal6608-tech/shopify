import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { thresholdsSchema } from "@/lib/validation/records";

export const PATCH = apiHandler({ body: thresholdsSchema }, async ({ db, params, body }) => {
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null));
  const r = await db`update public.watchlist_items set thresholds = ${db.json(clean)} where product_id = ${uuid.parse(params.productId)}`;
  return { ok: r.count > 0 };
});
