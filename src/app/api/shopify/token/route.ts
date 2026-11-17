import { apiHandler } from "@/lib/api/handler";
import { issueTemporaryToken } from "@/lib/shopify/connection";
import { audit } from "@/lib/services/audit";
import { withUser } from "@/lib/db";

/** Owner-only: returns a fresh ~24 h Admin API token for use in an external tool. */
export const POST = apiHandler({ rateLimit: { bucket: "shopify:token", limit: 5, windowSec: 600 }, noTransaction: true }, async ({ user }) => {
  const r = await issueTemporaryToken(user.id);
  await withUser(user.id, (db) => audit(db, user.id, "shopify.token_issued", "shopify_integration", null, { shop: r.shopDomain, expiresAt: r.expiresAt }));
  return r;
});
