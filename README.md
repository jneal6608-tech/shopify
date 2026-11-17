# Dropship Intel — AI-assisted dropshipping research & validation platform

A research department for a solo operator who runs an umbrella Shopify store, buys samples, and markets with **organic, faceless short-form video** (TikTok, Instagram Reels, YouTube Shorts). It discovers products, measures demand and competition from real sources, scores opportunities with **transparent formulas**, generates faceless content plans, tracks real test results, and builds Shopify listings and landing pages — with explicit approval for every store change.

> **Ground rule:** the platform never invents market data. Every number is measured (API/export), recorded by you with a source, an explicitly labelled estimate, or AI interpretation — and the UI says which. Demo data is labelled `DEMO` everywhere.

## What's inside

| Area | What it does |
|---|---|
| Dashboard | Operation overview, today's recommendation (selected by formula, with evidence, sources, timestamps, confidence), recent discoveries, reports, trend changes, alerts |
| Discover / Categories | Search, filter (price, cost, margin, competition, demand direction, growth, content potential), sort, saved searches, custom categories, discovery candidates from Google Trends rising queries |
| Product research page | Score breakdown per component with inputs + provenance, confidence breakdown, trends (charts, ranges, % change only with comparable data), competitors, suppliers, faceless-content rubric, AI reports, score history with weight-change attribution |
| Trend Intelligence | Emerging / rapidly rising / stable / seasonal / saturating / declining / insufficient-data classification by explicit rules |
| Scoring | 0–100 opportunity score (configurable, versioned weights) + separate confidence score; missing data is penalised, never rewarded |
| Competitors / Suppliers | Market position, pricing landscape, complaints → differentiation; supplier red-flag rules and reliability ranking |
| Content Intelligence | 12 faceless formats, AI content packs (10 concepts, 10 hooks, 5 full scripts with shot lists), reference-video pattern analysis, your own best formats/hooks by click-through |
| Testing Workspace | 11-stage pipeline, capacity-aware priority plan, videos + cumulative metric snapshots, store funnel, verdict that separates attention from purchasing |
| Profit Calculator | Unit economics, break-even price / CAC / volume, volume scenarios, what-if comparison |
| Watchlist & alerts | Configurable thresholds, deduplicated alerts |
| Reports | Research reports, recommendation history vs real outcomes, learning insights with opt-in weight suggestions |
| Store Builder | Shopify connection, listing builder, landing-page builder (safe generated Liquid), storefront content, store assistant (drafts only), change requests with preview → approve → apply → rollback, sales sync |
| Scheduled research | Daily discovery, watchlist monitoring, trend alerts, competitor updates, daily summary, weekly reports, Shopify sync |
| Settings | Claude **Opus 5.5 or Sonnet 5.5**, monthly AI budget + metered usage, scoring weights, fees, preferences, integration status, jobs, demo data |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Supabase (Postgres + Auth + RLS) · postgres.js · Anthropic Claude API (`@anthropic-ai/sdk`) · Shopify GraphQL Admin API · Vitest · Playwright · Vercel (cron).

## Quick start (local)

```bash
pnpm install
cp .env.example .env.local          # then set AUTH_MODE=local and DATABASE_URL to a local Postgres
pnpm db:migrate:local               # applies the dev auth shim + migrations (local Postgres only)
pnpm dev                            # http://localhost:3000 → Settings → "Load demo data"
```

Full instructions: **[docs/SETUP.md](docs/SETUP.md)** (local, Supabase, Vercel).

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — environment variables, local setup, Supabase, Vercel deployment, verification
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture and the major decisions
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — every external integration, credentials, permissions, limits, manual workflows
- [docs/SCORING.md](docs/SCORING.md) — scoring, confidence, trend and validation formulas
- [docs/TESTING.md](docs/TESTING.md) — how to run the tests and the latest results
- [docs/CHECKLIST.md](docs/CHECKLIST.md) — development checklist, completed features, remaining limitations

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop / build / serve |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit + database + API tests (needs local Postgres, see docs/TESTING.md) |
| `pnpm test:e2e` | Playwright UI tests against a running dev server |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (or use `supabase db push`) |
