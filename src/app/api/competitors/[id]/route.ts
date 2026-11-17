import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { competitorSchema } from "@/lib/validation/records";
import { uuid } from "@/lib/validation/common";
import { scoreProduct } from "@/lib/services/scoring";

export const PATCH = apiHandler({ body: competitorSchema.partial() }, async ({ db, user, params, body }) => {
  const [r] = await db<{ productId: string }[]>`update public.competitors set ${db(body as never)} where id = ${uuid.parse(params.id)} returning product_id`;
  if (!r) throw notFound("Competitor");
  await scoreProduct(db, user.id, r.productId);
  return { ok: true };
});

export const DELETE = apiHandler({}, async ({ db, user, params }) => {
  const [r] = await db<{ productId: string }[]>`delete from public.competitors where id = ${uuid.parse(params.id)} returning product_id`;
  if (!r) throw notFound("Competitor");
  await scoreProduct(db, user.id, r.productId);
  return { ok: true };
});
