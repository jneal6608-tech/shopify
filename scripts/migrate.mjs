#!/usr/bin/env node
// Applies SQL migrations in order to DATABASE_URL, tracking applied files.
// Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs [--with-dev-shim]
//   --with-dev-shim  also applies supabase/dev/*.sql first (plain Postgres only!)
// For Supabase projects you can alternatively run `supabase db push`.
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const withShim = process.argv.includes("--with-dev-shim");
if (withShim && /supabase\.(co|com)/.test(url)) {
  console.error("Refusing to apply the dev auth shim to a Supabase-hosted database.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, onnotice: () => {} });
const root = path.resolve(import.meta.dirname, "..");

async function main() {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._migrations enable row level security`;
  const dirs = [];
  if (withShim) dirs.push(path.join(root, "supabase/dev"));
  dirs.push(path.join(root, "supabase/migrations"));
  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const name = `${path.basename(dir)}/${file}`;
      const [done] = await sql`select 1 from public._migrations where name = ${name}`;
      if (done) continue;
      const body = fs.readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public._migrations (name) values (${name})`;
      });
      console.log(`applied ${name}`);
    }
  }
  await sql.end();
}
main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
