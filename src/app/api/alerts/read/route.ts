import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";

export const POST = apiHandler({ body: z.object({ ids: z.array(z.string().uuid()).max(500).optional() }) }, async ({ db, body }) => {
  if (body.ids?.length) await db`update public.alerts set read_at = now() where id = any(${body.ids}::uuid[]) and read_at is null`;
  else await db`update public.alerts set read_at = now() where read_at is null`;
  return { ok: true };
});
