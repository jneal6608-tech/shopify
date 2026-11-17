import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { latestScore } from "@/lib/services/scoring";

export const POST = apiHandler(
  {
    body: z.object({
      decision: z.enum(["selected", "rejected", "continued", "paused", "discontinued", "scaled"]),
      reasons: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
      notes: z.string().trim().max(4000).default(""),
      outcome: z.enum(["performed_well", "performed_poorly", "inconclusive"]).nullable().default(null),
      actualMarginPct: z.number().min(-1000).max(100).nullable().default(null),
    }),
  },
  async ({ db, user, params, body }) => {
    const productId = uuid.parse(params.id);
    const s = await latestScore(db, productId);
    const [r] = await db`insert into public.product_decisions (user_id, product_id, decision, reasons, notes, outcome, actual_margin_pct, score_at_decision)
      values (${user.id}, ${productId}, ${body.decision}, ${body.reasons}, ${body.notes}, ${body.outcome}, ${body.actualMarginPct}, ${s?.total ?? null}) returning id`;
    // Close the loop on past recommendations for this product.
    if (body.outcome) {
      await db`update public.ai_recommendations set outcome = ${body.outcome}, outcome_recorded_at = now()
               where product_id = ${productId} and outcome is null`;
    } else if (body.decision === "rejected") {
      await db`update public.ai_recommendations set outcome = 'not_tested', outcome_recorded_at = now()
               where product_id = ${productId} and outcome is null`;
    }
    return r;
  },
);
