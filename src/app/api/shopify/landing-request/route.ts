import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { landingPageSchema } from "@/lib/ai/schemas";
import { landingPayload } from "@/lib/ai/store";
import { createChangeRequest } from "@/lib/shopify/changes";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/api/errors";

/** Turns reviewed landing content into a draft landing_page change request. */
export const POST = apiHandler(
  { body: z.object({ productId: z.string().uuid(), themeId: z.string(), shopifyProductHandle: z.string().max(255).nullable(), allowLiveTheme: z.boolean().default(false), content: landingPageSchema }), noTransaction: true },
  async ({ user, body }) => {
    const [p] = await withUser(user.id, (db) => db<{ name: string }[]>`select name from public.products where id = ${body.productId}`);
    if (!p) throw notFound("Product");
    const payload = landingPayload(body.content, { themeId: body.themeId, productName: p.name, productHandle: body.shopifyProductHandle, allowLiveTheme: body.allowLiveTheme });
    return createChangeRequest(user.id, { kind: "landing_page", title: `Landing page: ${p.name}`, summary: body.content.headline, payload, productId: body.productId, createdBy: "user" });
  },
);
