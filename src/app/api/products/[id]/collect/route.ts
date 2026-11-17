import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { collectForProduct } from "@/lib/services/collect";
import { uuid } from "@/lib/validation/common";

export const maxDuration = 120;

export const POST = apiHandler(
  {
    body: z.object({
      sources: z.array(z.enum(["google_trends_serpapi", "youtube_data_api", "meta_ad_library"])).max(3).optional(),
      query: z.string().trim().max(100).optional(),
    }),
    rateLimit: { bucket: "collect", limit: 20, windowSec: 300 },
    noTransaction: true,
  },
  async ({ user, params, body }) => collectForProduct(user.id, uuid.parse(params.id), body),
);
