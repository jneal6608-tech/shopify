import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { videoSchema } from "@/lib/validation/records";

export const POST = apiHandler({ body: videoSchema }, async ({ db, user, params, body }) => {
  const [r] = await db`insert into public.published_videos ${db({ ...body, userId: user.id, productId: uuid.parse(params.id) } as never)} returning id`;
  return r;
});
