import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { campaignSchema } from "@/lib/validation/records";

export const PATCH = apiHandler({ body: campaignSchema.partial() }, async ({ db, params, body }) => {
  const r = await db`update public.content_campaigns set ${db(body as never)} where id = ${uuid.parse(params.id)}`;
  if (r.count === 0) throw notFound("Campaign");
  return { ok: true };
});
export const DELETE = apiHandler({}, async ({ db, params }) => {
  await db`delete from public.content_campaigns where id = ${uuid.parse(params.id)}`;
  return { ok: true };
});
