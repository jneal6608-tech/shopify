import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";

export const DELETE = apiHandler({}, async ({ db, params }) => {
  await db`delete from public.reference_videos where id = ${uuid.parse(params.id)}`;
  return { ok: true };
});
