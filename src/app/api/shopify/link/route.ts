import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";

export const POST = apiHandler(
  { body: z.object({ productId: z.string().uuid(), shopifyProductGid: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/), handle: z.string().max(255).optional() }) },
  async ({ db, user, body }) => {
    await db`insert into public.shopify_product_links (user_id, product_id, shopify_product_gid, shopify_handle)
      values (${user.id}, ${body.productId}, ${body.shopifyProductGid}, ${body.handle ?? null}) on conflict (user_id, shopify_product_gid) do update set product_id = excluded.product_id`;
    return { ok: true };
  },
);
