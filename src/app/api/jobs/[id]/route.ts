import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";

export const PATCH = apiHandler({ body: z.object({ enabled: z.boolean().optional(), frequency: z.enum(["daily", "weekly", "manual"]).optional() }) }, async ({ db, params, body }) => {
  const id = uuid.parse(params.id);
  if (body.enabled !== undefined) await db`update public.research_jobs set enabled = ${body.enabled}, next_run_at = coalesce(next_run_at, now()) where id = ${id}`;
  if (body.frequency) await db`update public.research_jobs set frequency = ${body.frequency}, next_run_at = case when ${body.frequency} = 'manual' then null else coalesce(next_run_at, now()) end where id = ${id}`;
  return { ok: true };
});
