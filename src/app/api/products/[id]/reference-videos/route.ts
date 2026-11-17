import { apiHandler } from "@/lib/api/handler";
import { referenceVideoSchema } from "@/lib/validation/records";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler({ body: referenceVideoSchema }, async ({ db, user, params, body }) => {
  const [r] = await db`insert into public.reference_videos ${db({ ...body, userId: user.id, productId: uuid.parse(params.id) } as never)} returning id`;
  return r;
});
