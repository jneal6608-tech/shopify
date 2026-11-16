import { execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL!;

/** Drops and recreates the test database schema, then applies shim + migrations. */
export async function resetTestDb() {
  if (!/localhost|127\.0\.0\.1/.test(TEST_DB_URL)) throw new Error("Refusing to reset a non-local database");
  const sql = postgres(TEST_DB_URL, { onnotice: () => {} });
  await sql.unsafe(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
    grant usage on schema public to public;
  `);
  await sql.end();
  execFileSync("node", [path.resolve("scripts/migrate.mjs"), "--with-dev-shim"], {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
}

export function useTestEnv() {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.AUTH_MODE = "local";
  (process.env as Record<string, string>).NODE_ENV = "test";
}

export const USER_A = "00000000-0000-4000-8000-00000000000a";
export const USER_B = "00000000-0000-4000-8000-00000000000b";

export async function createAuthUser(id: string, email: string) {
  const sql = postgres(TEST_DB_URL, { onnotice: () => {} });
  await sql`insert into auth.users (id, email) values (${id}, ${email}) on conflict do nothing`;
  await sql.end();
}
