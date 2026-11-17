import { apiHandler } from "@/lib/api/handler";
import { productUpdateSchema } from "@/lib/validation/products";
import { deleteProduct, getProduct, updateProduct } from "@/lib/services/products";
import { scoreProduct } from "@/lib/services/scoring";
import { audit } from "@/lib/services/audit";
import { uuid } from "@/lib/validation/common";

export const GET = apiHandler({}, async ({ db, params }) => getProduct(db, uuid.parse(params.id)));

export const PATCH = apiHandler({ body: productUpdateSchema }, async ({ db, user, params, body }) => {
  const id = uuid.parse(params.id);
  await updateProduct(db, id, body);
  const s = await scoreProduct(db, user.id, id);
  return { id, score: s.result.total, confidence: s.result.confidence };
});

export const DELETE = apiHandler({}, async ({ db, user, params }) => {
  const id = uuid.parse(params.id);
  await deleteProduct(db, id);
  await audit(db, user.id, "product.delete", "product", id, {});
  return { id };
});
