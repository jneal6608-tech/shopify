import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler({}, async ({ db, params }) => {
  await db`update public.discovery_candidates set status = 'dismissed' where id = ${uuid.parse(params.id)}`;
  return { ok: true };
});
