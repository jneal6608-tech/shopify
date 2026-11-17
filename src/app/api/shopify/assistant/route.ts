import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { runStoreAssistant } from "@/lib/ai/store";
import { withUser } from "@/lib/db";
import { notFound } from "@/lib/api/errors";

export const maxDuration = 300;

export const POST = apiHandler(
  { body: z.object({ conversationId: z.string().uuid().optional(), message: z.string().trim().min(1).max(4000) }), rateLimit: { bucket: "ai", limit: 20, windowSec: 600 }, noTransaction: true },
  async ({ user, body }) => {
    let id = body.conversationId;
    if (id) {
      const [c] = await withUser(user.id, (db) => db`select id from public.ai_conversations where id = ${id!}`);
      if (!c) throw notFound("Conversation");
    } else {
      const [c] = await withUser(user.id, (db) => db<{ id: string }[]>`insert into public.ai_conversations (user_id, title) values (${user.id}, ${body.message.slice(0, 80)}) returning id`);
      id = c.id;
    }
    const r = await runStoreAssistant(user.id, id, body.message);
    return { conversationId: id, ...r };
  },
);
