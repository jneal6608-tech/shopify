import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { weightsSchema, describeWeightChange } from "@/lib/analytics/weights";
import { activeWeights, scoreProduct } from "@/lib/services/scoring";
import { badRequest } from "@/lib/api/errors";
import { audit } from "@/lib/services/audit";

/** Creates a new weight version (never edits in place) and rescores every product. */
export const PUT = apiHandler(
  { body: z.object({ weights: weightsSchema, reason: z.string().trim().min(3).max(1000), source: z.enum(["user", "accepted_suggestion"]).default("user") }) },
  async ({ db, user, body }) => {
    const cur = await activeWeights(db, user.id);
    const changes = describeWeightChange(cur.weights, body.weights);
    if (changes.length === 0) throw badRequest("Weights are unchanged.");
    await db`update public.scoring_weight_versions set is_active = false where is_active`;
    const [v] = await db<{ id: string; version: number }[]>`
      insert into public.scoring_weight_versions (user_id, version, weights, reason, source, is_active)
      values (${user.id}, ${cur.version + 1}, ${db.json(body.weights)}, ${body.reason}, ${body.source}, true) returning id, version`;
    const ids = await db<{ id: string }[]>`select id from public.products where stage <> 'archived'`;
    for (const p of ids) await scoreProduct(db, user.id, p.id);
    await audit(db, user.id, "settings.weights", "scoring_weight_versions", v.id, { changes, reason: body.reason, source: body.source });
    return { version: v.version, rescored: ids.length, changes };
  },
);
