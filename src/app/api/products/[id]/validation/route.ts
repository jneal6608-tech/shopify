import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { withUser } from "@/lib/db";
import { validationFor } from "@/lib/services/testing";
import { generateValidationNarrative } from "@/lib/ai/features";

export const maxDuration = 300;

/** AI interpretation of the deterministic validation analysis. */
export const POST = apiHandler({ rateLimit: { bucket: "ai", limit: 20, windowSec: 600 }, noTransaction: true }, async ({ user, params }) => {
  const productId = uuid.parse(params.id);
  const v = await withUser(user.id, (db) => validationFor(db, productId));
  const r = await generateValidationNarrative(user.id, productId, v.result);
  return { id: r.id, meta: r.meta };
});
