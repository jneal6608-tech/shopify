import { apiHandler } from "@/lib/api/handler";
import { stageChangeSchema } from "@/lib/validation/products";
import { setStage } from "@/lib/services/products";
import { ensureTestingProject } from "@/lib/services/testing";
import { TESTING_STAGES, uuid } from "@/lib/validation/common";

export const POST = apiHandler({ body: stageChangeSchema }, async ({ db, user, params, body }) => {
  const id = uuid.parse(params.id);
  const r = await setStage(db, user.id, id, body.stage, body.reason);
  if (TESTING_STAGES.includes(body.stage)) await ensureTestingProject(db, user.id, id);
  return r;
});
