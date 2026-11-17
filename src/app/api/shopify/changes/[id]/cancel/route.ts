import { apiHandler } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler({}, async ({ db, params }) => {
  const r = await db`update public.shopify_change_requests set status = 'cancelled' where id = ${uuid.parse(params.id)} and status in ('draft','failed')`;
  if (r.count === 0) throw badRequest("Only draft or failed change requests can be cancelled.");
  return { ok: true };
});
