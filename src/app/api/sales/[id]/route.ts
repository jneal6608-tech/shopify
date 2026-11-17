import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";

export const DELETE = apiHandler({}, async ({ db, params }) => {
  await db`delete from public.sales_performance where id = ${z.coerce.number().int().parse(params.id)} and source = 'manual'`;
  return { ok: true };
});
