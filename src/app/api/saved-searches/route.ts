import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";

export const POST = apiHandler(
  { body: z.object({ name: z.string().trim().min(1).max(120), filters: z.record(z.string(), z.string().max(200)) }) },
  async ({ db, user, body }) => {
    const [r] = await db`insert into public.saved_searches (user_id, name, filters) values (${user.id}, ${body.name}, ${db.json(body.filters)}) returning id`;
    return r;
  },
);
