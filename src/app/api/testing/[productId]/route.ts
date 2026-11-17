import { apiHandler } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { testingProjectSchema } from "@/lib/validation/records";
import { ensureTestingProject } from "@/lib/services/testing";

export const PATCH = apiHandler({ body: testingProjectSchema }, async ({ db, user, params, body }) => {
  const productId = uuid.parse(params.productId);
  await ensureTestingProject(db, user.id, productId);
  const cols = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(cols).length) await db`update public.testing_projects set ${db(cols as never)} where product_id = ${productId}`;
  return { ok: true };
});
