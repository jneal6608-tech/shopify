import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { rollbackChangeRequest } from "@/lib/shopify/changes";
import { uuid } from "@/lib/validation/common";

export const maxDuration = 120;

export const POST = apiHandler({ body: z.object({ confirmed: z.literal(true) }), noTransaction: true }, async ({ user, params }) => rollbackChangeRequest(user.id, uuid.parse(params.id)));
