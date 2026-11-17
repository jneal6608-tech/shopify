import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { scoreProduct } from "@/lib/services/scoring";

export const DELETE = apiHandler({}, async ({ db, user, params }) => {
  const id = z.coerce.number().int().positive().parse(params.id);
  const [row] = await db<{ productId: string }[]>`delete from public.trend_observations where id = ${id} returning product_id`;
  if (!row) throw notFound("Observation");
  await scoreProduct(db, user.id, row.productId);
  return { ok: true };
});
