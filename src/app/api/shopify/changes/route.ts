import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { CHANGE_KINDS, createChangeRequest } from "@/lib/shopify/changes";

export const POST = apiHandler(
  { body: z.object({ kind: z.enum(CHANGE_KINDS), title: z.string().trim().min(1).max(300), summary: z.string().max(4000).default(""), payload: z.unknown(), productId: z.string().uuid().nullable().default(null) }), noTransaction: true },
  async ({ user, body }) => createChangeRequest(user.id, { ...body, createdBy: "user" }),
);
