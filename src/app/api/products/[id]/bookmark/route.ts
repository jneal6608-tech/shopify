import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { setBookmark } from "@/lib/services/products";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler({ body: z.object({ value: z.boolean() }) }, async ({ db, params, body }) => {
  await setBookmark(db, uuid.parse(params.id), body.value);
  return { ok: true };
});
