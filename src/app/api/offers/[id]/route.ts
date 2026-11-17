import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { scoreProduct } from "@/lib/services/scoring";

export const DELETE = apiHandler({}, async ({ db, user, params }) => {
  const [r] = await db<{ productId: string }[]>`delete from public.supplier_offers where id = ${uuid.parse(params.id)} returning product_id`;
  if (!r) throw notFound("Offer");
  await scoreProduct(db, user.id, r.productId);
  return { ok: true };
});
