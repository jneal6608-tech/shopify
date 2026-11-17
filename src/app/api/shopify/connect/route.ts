import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { connectStore, disconnectStore } from "@/lib/shopify/connection";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { audit } from "@/lib/services/audit";
import { withUser } from "@/lib/db";

const body = z.discriminatedUnion("authMode", [
  z.object({ authMode: z.literal("admin_token"), shopDomain: z.string().min(3).max(255), accessToken: z.string().min(10).max(500) }),
  z.object({ authMode: z.literal("client_credentials"), shopDomain: z.string().min(3).max(255), clientId: z.string().min(5).max(200), clientSecret: z.string().min(5).max(500) }),
]);

export const POST = apiHandler({ body, rateLimit: { bucket: "shopify:connect", limit: 10, windowSec: 600 }, noTransaction: true }, async ({ user, body }) => {
  const r = await connectStore(user.id, { ...body, shopDomain: normalizeShopDomain(body.shopDomain) });
  await withUser(user.id, (db) => audit(db, user.id, "shopify.connect", "shopify_integration", null, { shop: r.shopName, mode: body.authMode }));
  return r;
});

export const DELETE = apiHandler({ noTransaction: true }, async ({ user }) => {
  await disconnectStore(user.id);
  await withUser(user.id, (db) => audit(db, user.id, "shopify.disconnect", "shopify_integration", null, {}));
  return { ok: true };
});
