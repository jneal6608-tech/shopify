import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { analyzeContentPatterns, generateCompetitorAnalysis, generateContentPack, generateEvaluation, suggestAssessments } from "@/lib/ai/features";
import { withUser } from "@/lib/db";
import { scoreProduct } from "@/lib/services/scoring";

export const maxDuration = 300;

const FEATURES = {
  evaluation: generateEvaluation,
  "content-pack": generateContentPack,
  competitors: generateCompetitorAnalysis,
  "content-patterns": analyzeContentPatterns,
  assessments: async (userId: string, productId: string) => {
    const r = await suggestAssessments(userId, productId);
    await withUser(userId, (db) => scoreProduct(db, userId, productId));
    return r;
  },
} as const;

export const POST = apiHandler(
  { rateLimit: { bucket: "ai", limit: 20, windowSec: 600 }, noTransaction: true },
  async ({ user, params }) => {
    const fn = FEATURES[params.feature as keyof typeof FEATURES];
    if (!fn) throw notFound("AI feature");
    const productId = uuid.parse(params.id);
    // Ownership check under RLS before spending tokens.
    const exists = await withUser(user.id, (db) => db`select 1 from public.products where id = ${productId}`);
    if (exists.length === 0) throw notFound("Product");
    const r = await fn(user.id, productId);
    return { id: "id" in r ? r.id : null, meta: r.meta };
  },
);
