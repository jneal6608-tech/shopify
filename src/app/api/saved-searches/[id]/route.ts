import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";

export const DELETE = apiHandler({}, async ({ db, params }) => {
  await db`delete from public.saved_searches where id = ${uuid.parse(params.id)}`;
  return { ok: true };
});
