import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { campaignSchema } from "@/lib/validation/records";

export const POST = apiHandler({ body: campaignSchema }, async ({ db, user, params, body }) => {
  const [r] = await db`insert into public.content_campaigns ${db({ ...body, userId: user.id, productId: uuid.parse(params.id) } as never)} returning id`;
  return r;
});
