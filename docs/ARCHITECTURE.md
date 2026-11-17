# Architecture

```
Browser (React client components, no secrets)
   │  fetch /api/*  (same-origin, cookie session)
   ▼
Next.js 16 on Vercel
 ├─ proxy.ts ............ refreshes Supabase session cookie, optimistic redirect to /login
 ├─ app/(app)/* ......... server components: read via services under RLS
 ├─ app/api/* ........... route handlers wrapped by apiHandler()
 │     auth → same-origin check → rate limit → Zod validation → RLS transaction → JSON errors
 ├─ lib/analytics/* ..... pure, deterministic engines (scoring, trends, profit, validation,
 │                        supplier flags, alerts, learning) — unit tested
 ├─ lib/services/* ...... data access + orchestration (products, observations, scoring, testing…)
 ├─ lib/sources/* ....... external data adapters (SerpApi Google Trends, YouTube, Meta Ad Library, CSV)
 ├─ lib/ai/* ............ Claude: structured outputs, usage metering, budget, store assistant tools
 ├─ lib/shopify/* ....... GraphQL Admin client, connection/auth, change-request engine, sync
 └─ lib/jobs/* .......... scheduled research runner + handlers  ◄── Vercel Cron /api/cron/run
   │
   ▼
Supabase Postgres (RLS on every user table)   Supabase Auth (identity)
```

## Major decisions

### 1. Direct Postgres access with per-request RLS (instead of PostgREST from the browser)
Server code connects with `postgres.js` (Supavisor transaction pooler, `prepare: false`). For each request, `withUser()` opens a transaction, runs `SET LOCAL ROLE authenticated` and sets `request.jwt.claims` to the **server-verified** user id (`supabase.auth.getUser()`), so Supabase's `auth.uid()` and every RLS policy apply exactly as they would through PostgREST. Benefits: real transactions, typed SQL, no secrets or query surface in the browser, and the whole stack is testable against plain Postgres (a local-only auth shim recreates `auth.uid()` and the roles). `withService()` (RLS-bypassing) is used only for background jobs, rate limits and the encrypted credential table, always filtering by `user_id` explicitly.

### 2. Defence in depth for multi-tenancy
- RLS policy `user_id = auth.uid()` on all user tables (with `WITH CHECK` on writes).
- Child rows reference parents through **composite foreign keys** `(id, user_id)`, so a user cannot attach observations, offers or videos to another user's product even by guessing IDs.
- Server-only tables (`shopify_credentials`, `rate_limits`) have RLS enabled with no policies and privileges revoked from client roles; `audit_log` is insert-only for users.
- `product_overview` is a `security_invoker` view so it respects the caller's RLS.

### 3. Deterministic scoring; AI explains, never decides
Opportunity, confidence, trend class, market position, supplier reliability, validation verdict, alerts, testing priorities and the dashboard recommendation are all **pure functions** with documented thresholds ([SCORING.md](SCORING.md)). The AI receives these results plus a provenance-labelled data bundle and is instructed (and structurally constrained by Zod schemas) to explain them, label each claim's basis, and list missing data. Missing inputs are imputed at 25/100 and lower confidence, so an empty product can never look attractive.

### 4. Provenance everywhere, append-only history
Observations carry source, kind (API, CSV import, manual, derived, AI, demo), reliability, `observed_at` vs `collected_at`, `is_estimate`, `is_demo` and a source URL; a unique key deduplicates re-collection. Scores are stored as snapshots with weights, weight-version id, formula version and an inputs digest, so the UI can say whether a change came from **new evidence, a weight change, a formula change or data ageing**. Weight changes are new versions with a required reason; learning suggestions are applied only when accepted.

### 5. Claude integration
- Models: the user chooses **`claude-opus-5-5`** (default) or **`claude-sonnet-5-5`** in Settings.
- Every call streams (`client.beta.messages.stream` → `finalMessage()`) with a JSON-schema output format derived from Zod; the stop reason is checked (refusal / max_tokens) before the output is validated, and invalid output is rejected rather than stored.
- Server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- Token usage is metered per call into `ai_usage` with model-specific prices; a monthly budget blocks calls before they are sent.
- The **store assistant** uses the SDK tool runner with read tools (Shopify + research data) and `propose_*` tools that only create **draft change requests**. AI calls never hold a database transaction open.
- Messages API (self-hosted loop) was chosen over Managed Agents because all tools are local database/Shopify calls that must run under the user's RLS session inside this app.

### 6. Shopify change-request engine
Every consequential store action (product create/update/status, prices, collections, pages, theme files, landing pages) is a row in `shopify_change_requests`: **draft + preview** (current vs proposed) → explicit approval (`confirmed: true`, plus a second confirmation for the live theme) → atomic claim (`draft → applying`, preventing double-apply) → fresh **backup** of the affected state → apply → **rollback** from the backup. Products are always created as `DRAFT`; landing pages are added as *new* section/template files plus an unpublished page; the live theme is refused unless explicitly allowed. Generated Liquid escapes HTML and Liquid delimiters; HTML bodies are sanitised.

### 7. Scheduled research
`research_jobs` rows per user/kind with frequency, `next_run_at`, a lease (`locked_until`) and failure counters. `/api/cron/run` claims due jobs with `FOR UPDATE SKIP LOCKED`, records each run in `job_runs`, reschedules on success, backs off exponentially on failure, and raises an alert after 3 consecutive failures. Summaries and recommendations are deduplicated by evidence hash, so the same opportunity is not re-reported without new evidence.

### 8. Cost-conscious infrastructure
No queues, Redis or extra services: Postgres provides rate limiting, job locking and dedupe; Vercel Cron triggers jobs. External API calls are only made on demand or by scheduled jobs, never for demo products.

## Data model (main tables)

`profiles`, `user_preferences`, `scoring_weight_versions`, `categories`, `data_sources`, `products`, `product_stage_events`, `product_assessments`, `trend_observations`, `product_scores`, `research_reports`, `competitors`, `reference_videos`, `suppliers`, `supplier_offers`, `supplier_comparisons`, `watchlist_items`, `alerts`, `saved_searches`, `discovery_candidates`, `testing_projects`, `content_campaigns`, `published_videos`, `video_performance`, `sales_performance`, `product_decisions`, `content_packs`, `ai_recommendations`, `ai_conversations`, `ai_messages`, `ai_usage`, `shopify_integrations`, `shopify_credentials`, `shopify_product_links`, `shopify_change_requests`, `research_jobs`, `job_runs`, `audit_log`, `rate_limits`. See `supabase/migrations/`.
