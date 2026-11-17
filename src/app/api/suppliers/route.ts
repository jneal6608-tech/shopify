import { apiHandler } from "@/lib/api/handler";
import { supplierSchema } from "@/lib/validation/records";

export const GET = apiHandler({}, async ({ db }) => db`select * from public.suppliers order by name`);

export const POST = apiHandler({ body: supplierSchema }, async ({ db, user, body }) => {
  const [r] = await db`insert into public.suppliers ${db({ ...body, userId: user.id } as never)} returning id`;
  return r;
});
