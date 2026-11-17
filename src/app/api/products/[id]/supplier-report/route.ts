import { apiHandler } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { supplierOffersFor } from "@/lib/services/suppliers";
import { compareOffers } from "@/lib/analytics/suppliers";

export const POST = apiHandler({}, async ({ db, user, params }) => {
  const productId = uuid.parse(params.id);
  const offers = await supplierOffersFor(db, productId);
  if (offers.length === 0) throw badRequest("Add at least one supplier offer first.");
  const report = compareOffers(offers);
  const [r] = await db`insert into public.supplier_comparisons (user_id, product_id, offer_ids, report)
    values (${user.id}, ${productId}, ${offers.map((o) => o.offerId)}, ${db.json(report as never)}) returning id`;
  await db`insert into public.research_reports (user_id, product_id, kind, title, model, output)
    values (${user.id}, ${productId}, 'supplier_reliability', 'Supplier reliability report', null, ${db.json({ assessments: report } as never)})`;
  return { id: r.id, report };
});
