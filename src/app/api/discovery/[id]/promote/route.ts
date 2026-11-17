import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { createProduct } from "@/lib/services/products";
import { scoreProduct } from "@/lib/services/scoring";

export const POST = apiHandler({}, async ({ db, user, params }) => {
  const id = uuid.parse(params.id);
  const [c] = await db<{ query: string; categoryId: string | null; isDemo: boolean }[]>`select query, category_id, is_demo from public.discovery_candidates where id = ${id} and status = 'new'`;
  if (!c) throw notFound("Candidate");
  const name = c.query.replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 200);
  const existing = await db<{ id: string }[]>`select id from public.products where lower(name) = lower(${name})`;
  const productId = existing[0]?.id ?? (await createProduct(db, user.id, { name, description: "", categoryId: c.categoryId, targetCustomer: "", problemSolved: "", keywords: [c.query.toLowerCase()], discoverySource: "google_trends_rising" }, { isDemo: c.isDemo }));
  await db`update public.discovery_candidates set status = 'promoted', product_id = ${productId} where id = ${id}`;
  await scoreProduct(db, user.id, productId);
  return { productId };
});
