# External integrations

Status for each integration is shown in **Settings → Integration status** and on the product Trends tab. Missing credentials never break the app: features explain what is needed.

## Anthropic Claude API — AI features
- **Credential:** `ANTHROPIC_API_KEY` (console.anthropic.com → API keys).
- **Models:** chosen per user in Settings — `claude-opus-5-5` (default, most capable) or `claude-sonnet-5-5` (about half the cost).
- **Used for:** product research reports, AI rubric suggestions, content packs, competitor and content-pattern analysis, comparison reports, validation interpretation, Shopify listing / landing / storefront copy, store assistant, optional summary narratives.
- **Controls:** monthly budget (Settings), metered usage per feature, per-user rate limit (20 AI requests / 10 min).
- **Estimated cost per use** (Opus 5.5; Sonnet ≈ half): report $0.08–0.15 · content pack $0.25–0.40 · competitor analysis $0.06–0.10 · comparison $0.11–0.15 · validation $0.07–0.10 · listing ~$0.08 · landing page $0.15–0.25 · daily narrative ~$0.10.

## Google Trends
Google provides no generally available public API.
1. **SerpApi (automated):** `SERPAPI_API_KEY` from serpapi.com (paid; one search credit per collection). Used for weekly interest over 12 months and "rising related queries" for discovery.
2. **CSV export (no credentials):** trends.google.com → Explore → "Interest over time" ⬇ → product Trends tab → *Import Google Trends CSV*. Handles multi-term exports and `<1` values.

Values are a 0–100 index relative to the peak *for that query and window*; different queries are not comparable in level (the UI says so).

## YouTube Data API v3 — short-form content signal
- **Credential:** `YOUTUBE_API_KEY` (Google Cloud Console → enable *YouTube Data API v3* → API key, restrict to that API).
- **Collects:** for the product query, short videos published in the last 30 days among the top 50 search results: count, total public views, distinct channels. These are **sample-based** metrics and labelled as such.
- **Quota:** 10,000 units/day by default; each collection ≈ 101 units.

## Meta Ad Library API — advertising activity
- **Credential:** `META_AD_LIBRARY_ACCESS_TOKEN` — confirm identity at facebook.com/ID, create a Meta developer app, generate a user access token with `ads_read`. Tokens expire; refresh when collection reports an auth error.
- **Limitation:** non-political ads are only returned for ads delivered in the EU/UK. Counts therefore reflect `META_AD_REACHED_COUNTRIES` (default DE, FR, IT, ES, NL, IE), capped at 1,000 per collection.
- **Manual alternative (any country):** facebook.com/ads/library, record the count as a manual observation with the URL.

## TikTok Creative Center — manual
No public API for Creative Center (TikTok's Research API is restricted to approved academic researchers). Workflow: Creative Center → Trends → Hashtags / Top products → record posts or views as a manual observation with the page URL and date.

## Amazon — manual
The Product Advertising API requires an approved Associates account with qualifying sales, so it is not integrated. Record the top listing's review count (`amazon_top_review_count`), best-seller rank and price manually with the listing URL; review counts feed the competition score.

## Shopify GraphQL Admin API
- **API version:** `SHOPIFY_API_VERSION` (default `2026-10`). Requests: `POST https://{shop}.myshopify.com/admin/api/{version}/graphql.json` with `X-Shopify-Access-Token`.
- **Connecting (Store Builder → Connection):**
  - **Dev Dashboard app (required for new custom apps since 1 Jan 2026):** create an app in the Shopify Dev Dashboard under the organization that owns the store, configure the scopes below, install it on the store, paste the **client ID + secret**. The platform uses the client-credentials grant (`POST /admin/oauth/access_token`) to obtain short-lived tokens (~24 h), caches them encrypted and refreshes automatically (also on a 401).
  - **Existing legacy custom app:** paste its Admin API access token.
  - The connection is verified (`shop` + `currentAppInstallation.accessScopes`) before anything is stored.
- **Scopes:** `read_products`, `write_products`, `read_orders` (required); `read_themes`, `write_themes`, `read_content`/`write_content` (or `read_online_store_pages`/`write_online_store_pages`) for landing pages. `read_all_orders` is needed for orders older than 60 days.
- **What the platform does (all writes via approved change requests):** create DRAFT products with variants/prices/cost, update content/SEO, change status (publish), change prices, create collections, create unpublished pages, add theme section/template files, landing pages; read products, collections, themes, theme files and orders.
- **Safety:** preview, explicit confirmation, live-theme refusal unless explicitly allowed + reconfirmed, backup before apply, rollback, audit log, HTML sanitisation, Liquid escaping, throttle-aware retries.
- **Not available via Admin API:** storefront sessions/conversion rate (enter from Shopify Analytics manually), theme editor customisations stored in `settings_data.json` for arbitrary themes (the assistant can draft theme file changes for review, preferably on a duplicated theme), inventory quantities per location (configure in Shopify).
- **Unverified in this build:** the integration was implemented against the documented GraphQL Admin API but could not be exercised against a live store from the build environment (shopify.dev was not reachable); it is covered by tests against a mocked Admin API. Run *Check connection* after connecting and try a draft product first.

## Supabase
Auth (email + password, magic link, confirmation callback at `/auth/callback`) and Postgres. See [SETUP.md](SETUP.md).

## Vercel Cron
`vercel.json` → `/api/cron/run` daily; protected by `CRON_SECRET` (constant-time comparison).
