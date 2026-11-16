import "server-only";
import postgres from "postgres";
import { env } from "../env";

/**
 * Database access.
 *
 * The app talks to Supabase Postgres directly (Supavisor transaction pooler in
 * production, port 6543 — hence `prepare: false`). Every user request runs in
 * a transaction that switches to the `authenticated` role and sets the
 * verified user's JWT claims, so Supabase Row Level Security policies
 * (`user_id = auth.uid()`) apply to every statement exactly as they would via
 * PostgREST. `withService` is reserved for background jobs and server-only
 * tables (credentials, rate limits, audit log) and always filters by user_id
 * explicitly.
 */
export type Sql = postgres.Sql<Record<string, never>>;
export type Db = postgres.TransactionSql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __dropshipSql?: Sql };

export function getSql(): Sql {
  if (globalForDb.__dropshipSql) return globalForDb.__dropshipSql;
  const url = env().DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  const sql = postgres(url, {
    prepare: false,
    max: env().DB_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    transform: postgres.camel,
    types: {
      // numeric and bigint as JS numbers (values here stay well within 2^53).
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
    },
  }) as unknown as Sql;
  globalForDb.__dropshipSql = sql;
  return sql;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run `fn` as the given (already authenticated) user with RLS enforced. */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error("withUser: invalid user id");
  const sql = getSql();
  return sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return fn(tx as unknown as Db);
  }) as Promise<T>;
}

/** Run `fn` with the connection owner's privileges (bypasses RLS). Server-only. */
export async function withService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const sql = getSql();
  return sql.begin(async (tx) => fn(tx as unknown as Db)) as Promise<T>;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__dropshipSql) {
    await globalForDb.__dropshipSql.end({ timeout: 5 });
    globalForDb.__dropshipSql = undefined;
  }
}
