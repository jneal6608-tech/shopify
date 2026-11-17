import { apiHandler } from "@/lib/api/handler";
import { insertObservations, listObservations, manualObservationSchema } from "@/lib/services/observations";
import { scoreProduct } from "@/lib/services/scoring";
import { uuid } from "@/lib/validation/common";

export const GET = apiHandler({}, async ({ db, params }) => listObservations(db, uuid.parse(params.id)));

export const POST = apiHandler({ body: manualObservationSchema }, async ({ db, user, params, body }) => {
  const id = uuid.parse(params.id);
  const r = await insertObservations(db, user.id, id, [{ ...body, raw: { entry: "manual" } }]);
  if (r.inserted === 0) return { ...r, message: "An identical observation already exists for that date." };
  await scoreProduct(db, user.id, id);
  return r;
});
