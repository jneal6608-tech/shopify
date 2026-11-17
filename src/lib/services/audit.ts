import "server-only";
import type { Db } from "../db";

/** Append-only audit trail, written in the caller's transaction. */
export async function audit(db: Db, userId: string, action: string, entity: string, entityId: string | null, details: Record<string, unknown>) {
  await db`insert into public.audit_log (user_id, action, entity, entity_id, details)
           values (${userId}, ${action}, ${entity}, ${entityId}, ${db.json(details as never)})`;
}
