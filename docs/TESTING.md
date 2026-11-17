# Testing

## Suites

| Suite | Location | What it covers |
|---|---|---|
| Unit | `tests/unit` | Scoring (missing-data penalty, determinism, confidence factors, recommendation rules, weights), trend classification (incl. detrended seasonality, saturation, windowed % change), profit calculator, validation verdicts & testing priorities, supplier red flags, alert dedupe, learning suggestions, Google Trends CSV parser, job scheduling/backoff, Shopify order aggregation, landing-page Liquid escaping, HTML sanitiser, payload validation (GIDs, path traversal), crypto (AES-GCM tamper detection), production auth guard, log redaction, HTTP retry/validation, SerpApi/YouTube/Meta adapters against mocked responses |
| Database | `tests/db` | Migrations apply cleanly; RLS isolation (cross-user read/update/delete/insert-spoofing blocked, composite FKs block attaching data to another user's product, server-only tables denied); constraints; product search/filters/stage history; observation dedupe; score snapshotting; mocked Shopify lifecycle (encrypted credentials, client-credentials exchange, approval gate, throttle retry, no double-apply, product link, rollback, theme backup/restore, live-theme refusal); concurrent cron claims each job once; AI runner request shape (model, streaming, fallbacks, JSON schema), usage metering, budget enforcement, malformed output / refusal / truncation handling |
| API | `tests/api` | Full workflow through route handlers: create → isolate → CSV import (dedupe) → manual observation (source URL required) → assessments → competitors → suppliers/offers → reliability report → watchlist → testing stage → videos & cumulative snapshots → sales → validation verdict → decision; AI disabled error; demo load/remove labelling; cross-origin rejection; rate limiting |
| UI (Playwright) | `tests/e2e` | Dashboard; create product from Discover; search/filter; rate faceless formats; manual observation; move to testing and record a video; calculator reactivity; Settings model choice & integration status; Store Builder approval gate; demo labelling; mobile navigation and no horizontal overflow |

## Running

Database, API and UI tests need a local PostgreSQL 15+ (they create/reset `dropship_test`; the harness refuses non-local URLs).

```bash
createdb dropship_test
pnpm test                          # unit + db + api (TEST_DATABASE_URL defaults to postgres://postgres:postgres@localhost:5432/dropship_test)
pnpm test:unit                     # unit only (no database needed)
```

UI tests run against a dev server in local auth mode:

```bash
pnpm db:migrate:local              # with DATABASE_URL pointing at your local dev database
pnpm dev                           # AUTH_MODE=local in .env.local
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
# If you use a pre-installed Chromium: PW_CHROMIUM_PATH=/path/to/chrome pnpm test:e2e
```

## Latest results (this build)

- `pnpm typecheck` — clean
- `pnpm build` — succeeds (Next.js 16.4.6, Turbopack)
- `pnpm test` — **13 files, 100 tests passed**
- `pnpm test:e2e` — **11 tests passed** (10 desktop, 1 mobile)
- Manual smoke test: all 14 sections, every product tab and all eight scheduled jobs ran against demo data; `/api/health` → ok

## Not covered by automated tests

- Live calls to Anthropic, SerpApi, YouTube, Meta and Shopify (no credentials in the build environment; covered with mocked HTTP responses that follow the documented formats).
- Supabase-hosted Auth flows (sign-up, magic link) — exercised only through the local auth mode.
