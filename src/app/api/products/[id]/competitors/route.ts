import { apiHandler } from "@/lib/api/handler";
import { competitorSchema } from "@/lib/validation/records";
import { uuid } from "@/lib/validation/common";
import { scoreProduct } from "@/lib/services/scoring";

export const POST = apiHandler({ body: competitorSchema }, async ({ db, user, params, body }) => {
  const productId = uuid.parse(params.id);
  const [r] = await db`insert into public.competitors ${db({ ...body, userId: user.id, productId } as never)} returning id`;
  await scoreProduct(db, user.id, productId);
  return r;
});
