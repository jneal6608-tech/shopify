import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { generateLandingContent, generateListing, generateStorefront } from "@/lib/ai/store";

export const maxDuration = 300;

export const POST = apiHandler(
  { body: z.object({ productId: z.string().uuid().optional(), brief: z.string().max(4000).optional() }), rateLimit: { bucket: "ai", limit: 20, windowSec: 600 }, noTransaction: true },
  async ({ user, params, body }) => {
    if (params.feature === "listing" && body.productId) return generateListing(user.id, body.productId);
    if (params.feature === "landing" && body.productId) return generateLandingContent(user.id, body.productId);
    if (params.feature === "storefront") return generateStorefront(user.id, body.brief ?? "");
    throw notFound("Feature");
  },
);
