import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { generateComparison } from "@/lib/ai/features";

export const maxDuration = 300;

export const POST = apiHandler(
  { body: z.object({ productIds: z.array(z.string().uuid()).min(2).max(5) }), rateLimit: { bucket: "ai", limit: 20, windowSec: 600 }, noTransaction: true },
  async ({ user, body }) => {
    const r = await generateComparison(user.id, [...new Set(body.productIds)]);
    return { id: r.id, meta: r.meta };
  },
);
