# Setup, environment & deployment

## 1. Requirements

- Node.js ≥ 20.9 (developed on 22), pnpm 10
- A Supabase project (production) or PostgreSQL 15+ (local development/tests)

## 2. Environment variables

All variables are documented in [`.env.example`](../.env.example). Everything except `NEXT_PUBLIC_*` is read only on the server.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production | Supabase Auth (sign-in, sessions) |
| `DATABASE_URL` | yes | Postgres connection. On Supabase use the **Transaction pooler** string (port 6543) |
| `ENCRYPTION_KEY` | yes | 64 hex chars (`openssl rand -hex 32`). AES-256-GCM key for stored Shopify credentials |
| `CRON_SECRET` | yes | ≥16 chars. Vercel Cron authenticates to `/api/cron/run` with it |
| `ANTHROPIC_API_KEY` | optional | Enables AI features. Without it everything else works and AI buttons explain why they are disabled |
| `SERPAPI_API_KEY`, `YOUTUBE_API_KEY`, `META_AD_LIBRARY_ACCESS_TOKEN` | optional | Data sources — see [INTEGRATIONS.md](INTEGRATIONS.md) |
| `META_GRAPH_API_VERSION`, `META_AD_REACHED_COUNTRIES` | optional | Meta Ad Library request settings |
| `SHOPIFY_API_VERSION` | optional | GraphQL Admin API version (default `2026-10`) |
| `DB_POOL_MAX` | optional | Connections per server instance (default 5) |
| `AUTH_MODE=local`, `LOCAL_DEV_USER_ID` | dev only | Fixed development user, no Supabase. **Refused when `NODE_ENV=production`** |

Shopify credentials are **not** environment variables: you enter them in Store Builder → Connection; they are verified, encrypted and stored in a table no client role can read.

## 3. Local development (no Supabase needed)

```bash
pnpm install
createdb dropship_dev                     # any local Postgres 15+
cat > .env.local <<'EOF'
AUTH_MODE=local
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dropship_dev
ENCRYPTION_KEY=<openssl rand -hex 32>
CRON_SECRET=<random string>
EOF
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dropship_dev pnpm db:migrate:local
pnpm dev
```

`db:migrate:local` first applies `supabase/dev/00_auth_shim.sql`, a **local-only** stand-in for Supabase's `auth` schema and roles, so the production migrations and RLS policies run unchanged on plain Postgres. The migration script refuses to apply the shim to a Supabase-hosted URL.

Open http://localhost:3000, then **Settings → Load demo data** to explore with labelled synthetic data. Remove it from the same place.

> `pnpm start` (production mode) refuses `AUTH_MODE=local` by design — use `pnpm dev` locally, or configure Supabase.

## 4. Supabase

1. Create a project. In **Authentication → Providers** keep Email enabled; set the Site URL to your deployment URL and add `https://<your-domain>/auth/callback` to Redirect URLs.
2. Apply the migrations (`supabase/migrations/*.sql`) with either:
   - `supabase link --project-ref <ref> && supabase db push`, or
   - `DATABASE_URL=<session or direct connection string> pnpm db:migrate`
3. Copy the API URL, anon/publishable key and the **Transaction pooler** connection string into your environment.
4. Verify role membership (normally already granted by Supabase; migration `…000005` also attempts it):
   `select pg_has_role('postgres', 'authenticated', 'member');` must return `true`. If not: `grant authenticated to postgres;`

Do **not** run anything in `supabase/dev/` against Supabase.

## 5. Vercel deployment

1. Import the repository in Vercel (framework preset: Next.js; install `pnpm install`; build `pnpm build`).
2. Add the environment variables from section 2 (Production + Preview).
3. Deploy. `vercel.json` registers a daily cron (`17 13 * * *` UTC) calling `/api/cron/run`; Vercel sends `Authorization: Bearer $CRON_SECRET`. Hobby plans allow daily crons; on Pro you can run it hourly (each run executes only jobs that are due).
4. Long-running routes (AI, collection, Shopify apply) declare `maxDuration` up to 300 s — ensure your plan allows it (Fluid compute).
5. Verify: `GET https://<domain>/api/health` → `{"ok":true,"database":true,"rlsRoleSwitch":true,"rlsEnabled":true,…}`.
6. Sign up at `/login`, then open **Settings → Integration status** to see what is configured.

## 6. Connecting Shopify

See [INTEGRATIONS.md → Shopify](INTEGRATIONS.md#shopify-graphql-admin-api). In short: create an app in the **Shopify Dev Dashboard** under the organization that owns the store, grant the listed scopes, install it on the store, then paste the client ID + secret in **Store Builder → Connection** (or a legacy `shpat_` token if you have an existing custom app).
