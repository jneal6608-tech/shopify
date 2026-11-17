import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { supplierSchema } from "@/lib/validation/records";
import { uuid } from "@/lib/validation/common";

export const PATCH = apiHandler({ body: supplierSchema.partial() }, async ({ db, params, body }) => {
  const r = await db`update public.suppliers set ${db(body as never)} where id = ${uuid.parse(params.id)}`;
  if (r.count === 0) throw notFound("Supplier");
  return { ok: true };
});

export const DELETE = apiHandler({}, async ({ db, params }) => {
  const r = await db`delete from public.suppliers where id = ${uuid.parse(params.id)}`;
  if (r.count === 0) throw notFound("Supplier");
  return { ok: true };
});
