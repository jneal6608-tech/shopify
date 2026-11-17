import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { applyChangeRequest } from "@/lib/shopify/changes";
import { uuid } from "@/lib/validation/common";

export const maxDuration = 120;

export const POST = apiHandler(
  { body: z.object({ confirmed: z.literal(true, { message: "Explicit confirmation is required" }), confirmLiveTheme: z.boolean().default(false) }), rateLimit: { bucket: "shopify:apply", limit: 30, windowSec: 600 }, noTransaction: true },
  async ({ user, params, body }) => applyChangeRequest(user.id, uuid.parse(params.id), body),
);
