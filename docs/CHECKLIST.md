# Development checklist

Legend: ✅ done and tested · 🟡 done, needs credentials / live verification · ⬜ not built

## Phase 1 — Foundation
- ✅ Next.js 16 + TypeScript + Tailwind 4 project, dark responsive UI, 14-section sidebar (mobile drawer)
- ✅ Relational schema, migrations, indexes, constraints, timestamps, append-only history
- ✅ RLS on every user table, composite tenant FKs, server-only secret tables
- ✅ Supabase Auth (password, magic link, callback, sign-out) · 🟡 not exercised against a live Supabase project
- ✅ Local dev auth (refused in production)
- ✅ Dashboard with stats, evidence-cited recommendation, discoveries, reports, trend changes, alerts
- ✅ Product database, search, filters, sorting, saved searches, categories (built-in + custom)
- ✅ Product research pages (overview, trends, competitors, suppliers, content, history); bookmark, watch, compare, archive, delete, stage changes with reasons

## Phase 2 — Intelligence
- ✅ Data-source catalog with reliability weights and provenance labels
- ✅ Google Trends CSV import · 🟡 SerpApi Google Trends, YouTube Data API, Meta Ad Library (need keys)
- ✅ Manual observation workflow (TikTok Creative Center, Amazon, Meta manual) with required source URL
- ✅ Trend classification (7 classes), interactive charts with 7d/30d/90d/12m/all, % change only with comparable data
- ✅ Opportunity scoring (configurable, versioned weights) and confidence scoring; missing data penalised
- ✅ AI research reports (evidence with basis labels, missing info, next steps) · 🟡 needs `ANTHROPIC_API_KEY`
- ✅ Product comparison (up to 5) with AI comparative report

## Phase 3 — Marketing
- ✅ Faceless-content rubric (12 formats), AI rubric suggestions labelled as estimates
- ✅ AI content packs: 10 concepts, 10 hooks, 5 scripts with shot lists, overlays, editing, voiceover, caption, CTA, hashtags, duration
- ✅ Reference-video recording (counts only as displayed) and AI pattern analysis with original concepts
- ✅ Competitor research, market position, complaints, AI differentiation analysis
- ✅ Content campaigns

## Phase 4 — Business operations
- ✅ Profit calculator (contribution vs net profit, break-even price/CAC/volume, scenarios, what-if)
- ✅ Supplier records, offers, comparison, reliability report, red flags
- ✅ Watchlist, configurable thresholds, deduplicated alerts
- ✅ Testing workspace: 11 stages, priority plan, videos + cumulative snapshots, sales periods, charts, deterministic verdict, AI interpretation
- ✅ Decisions & outcomes, recommendation history vs outcomes, learning insights with opt-in weight suggestions

## Phase 5 — Integrations
- ✅ Shopify connection (client credentials or legacy token), encrypted credentials, status/check/disconnect · 🟡 not verified against a live store
- ✅ Change-request engine: preview, approval, atomic apply, backup, rollback, audit log
- ✅ Listing builder (DRAFT products, variants, price, cost, SEO, tags, images), landing pages (new section + template + unpublished page), storefront content generator, store assistant (draft-only tools)
- ✅ Shopify sales sync into testing workspaces (orders, revenue, refunds) · 🟡 live store
- ✅ Scheduled research (8 job types), Vercel Cron, locking, backoff, failure alerts, daily summary without repeats

## Phase 6 — Optimization
- ✅ Security: same-origin checks, Postgres rate limiting, Zod validation, CSP and security headers, constant-time cron secret, secret redaction in logs, HTML sanitisation, Liquid escaping, SSRF-safe Shopify domains, no open image proxy
- ✅ Error handling: typed API errors, AI stop-reason handling, source failures isolated per source, health endpoint
- ✅ Tests: 100 unit/DB/API tests, 11 Playwright UI tests (desktop + mobile)
- ✅ Documentation: setup, deployment, environment, integrations, scoring, testing

## Remaining limitations
- **No live verification of external APIs** (Anthropic, SerpApi, YouTube, Meta, Shopify): implemented against documented formats and tested with mocks; verify with real credentials after deploying.
- **Shopify:** sessions/conversion are not available from the Admin API (manual entry); orders older than 60 days need `read_all_orders`; theme-editor settings for arbitrary themes are not modified automatically (the assistant drafts theme-file changes for review); inventory quantities and fulfilment are managed in Shopify; UTM-to-campaign sales attribution is not automated (the campaign stores its `utm_campaign` tag for manual reconciliation); OAuth authorization-code install for public apps is not implemented (single-store custom/Dev Dashboard apps only).
- **Data sources:** TikTok Creative Center and Amazon are manual by necessity; Meta Ad Library counts only EU/UK-delivered non-political ads; YouTube metrics are sample-based (top 50 results); Google Trends values are relative indices.
- **Discovery** of new products from rising queries requires SerpApi; without it, discovery is manual (or promote CSV-researched keywords).
- **Social video metrics** (TikTok/Instagram/YouTube analytics for your own videos) are entered manually; platform analytics APIs for creators are not integrated.
- **Learning loop** suggestions need at least four products with recorded outcomes before they appear.
- **Fonts** use the system UI font stack (no web font download at build time).
- **Single-tenant UX:** multi-user teams/sharing are not built (data is strictly per user).
