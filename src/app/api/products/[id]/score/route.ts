import { apiHandler } from "@/lib/api/handler";
import { scoreProduct } from "@/lib/services/scoring";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler({ rateLimit: { bucket: "score", limit: 120, windowSec: 60 } }, async ({ db, user, params }) => {
  const s = await scoreProduct(db, user.id, uuid.parse(params.id), { force: true });
  return { scoreId: s.scoreId, total: s.result.total, confidence: s.result.confidence, recommendation: s.result.recommendation };
});
