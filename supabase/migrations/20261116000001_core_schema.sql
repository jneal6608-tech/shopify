-- =============================================================================
-- Dropship Intelligence Platform — core schema
-- Target: Supabase Postgres (15+). Relies on Supabase's `auth` schema
-- (auth.users, auth.uid()) and roles (anon, authenticated, service_role).
--
-- Conventions
--   * Every user-owned row carries user_id and is protected by RLS
--     (user_id = auth.uid()).
--   * Child rows reference parents with composite (id, user_id) foreign keys so
--     a user can never attach data to another user's records.
--   * Observations / scores / performance snapshots are append-only history;
--     they are never overwritten.
--   * is_demo marks development demo data. Demo data must never be presented
--     as market intelligence; the UI labels it everywhere.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Users / preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ai_model text not null default 'claude-opus-5-5'
    check (ai_model in ('claude-opus-5-5', 'claude-sonnet-5-5')),
  ai_monthly_budget_usd numeric(10,2) check (ai_monthly_budget_usd is null or ai_monthly_budget_usd >= 0),
  testing_budget_usd numeric(12,2) check (testing_budget_usd is null or testing_budget_usd >= 0),
  weekly_hours numeric(6,1) check (weekly_hours is null or weekly_hours >= 0),
  target_margin_pct numeric(5,2) check (target_margin_pct is null or (target_margin_pct >= 0 and target_margin_pct <= 100)),
  max_supplier_cost numeric(10,2),
  preferred_category_ids uuid[] not null default '{}',
  avoided_keywords text[] not null default '{}',
  alert_thresholds jsonb not null default '{}'::jsonb,
  fee_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Versioned scoring weights: every change is recorded with a reason. The
-- model is never modified silently.
create table public.scoring_weight_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version int not null,
  weights jsonb not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  source text not null check (source in ('default', 'user', 'accepted_suggestion')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);
create unique index scoring_weight_versions_one_active
  on public.scoring_weight_versions (user_id) where is_active;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.data_sources (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  kind text not null check (kind in ('api', 'csv_import', 'manual', 'ai', 'demo', 'derived')),
  reliability numeric(3,2) not null check (reliability >= 0 and reliability <= 1),
  requires_credentials boolean not null default false,
  description text not null default '',
  docs_url text
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade, -- null = built-in
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '',
  seed_keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);
create unique index categories_slug_unique
  on public.categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  niche text check (char_length(niche) <= 120),
  target_customer text not null default '' check (char_length(target_customer) <= 1000),
  problem_solved text not null default '' check (char_length(problem_solved) <= 1000),
  keywords text[] not null default '{}',
  est_supplier_cost numeric(10,2) check (est_supplier_cost is null or est_supplier_cost >= 0),
  est_shipping_cost numeric(10,2) check (est_shipping_cost is null or est_shipping_cost >= 0),
  est_selling_price numeric(10,2) check (est_selling_price is null or est_selling_price >= 0),
  price_basis text not null default 'manual_estimate'
    check (price_basis in ('manual_estimate', 'supplier_offer', 'competitor_median', 'shopify')),
  weight_grams int check (weight_grams is null or weight_grams >= 0),
  is_fragile boolean,
  stage text not null default 'discovered' check (stage in (
    'discovered', 'researching', 'selected_for_testing', 'sample_ordered', 'sample_received',
    'content_production', 'testing', 'promising', 'scaling_consideration', 'discontinued', 'archived')),
  is_bookmarked boolean not null default false,
  discovery_source text not null default 'manual' check (char_length(discovery_source) <= 80),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index products_user_stage on public.products (user_id, stage);
create index products_user_category on public.products (user_id, category_id);
create index products_user_created on public.products (user_id, created_at desc);
create unique index products_user_name_unique on public.products (user_id, lower(name));
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_stage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  product_id uuid not null,
  from_stage text,
  to_stage text not null,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index product_stage_events_product on public.product_stage_events (product_id, created_at desc);

-- Rubric assessments (content potential, problem value, longevity). History is
-- kept; scoring uses the latest per kind. assessed_by='ai' marks AI estimates.
create table public.product_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  kind text not null check (kind in ('content', 'problem', 'longevity')),
  ratings jsonb not null,
  assessed_by text not null check (assessed_by in ('user', 'ai')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index product_assessments_latest on public.product_assessments (product_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Trend observations (append-only; deduplicated per source/metric/date/query)
-- ---------------------------------------------------------------------------
create table public.trend_observations (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  product_id uuid not null,
  source_key text not null references public.data_sources (key),
  metric text not null check (metric ~ '^[a-z0-9_]+$'),
  query text not null default '' check (char_length(query) <= 300),
  geo text not null default 'US' check (char_length(geo) <= 20),
  observed_at timestamptz not null,
  value numeric not null,
  is_estimate boolean not null default false,
  is_demo boolean not null default false,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  raw jsonb,
  collected_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (product_id, source_key, metric, query, geo, observed_at)
);
create index trend_observations_series on public.trend_observations (product_id, metric, observed_at);
create index trend_observations_user_collected on public.trend_observations (user_id, collected_at desc);

-- ---------------------------------------------------------------------------
-- Scores (history) and research reports
-- ---------------------------------------------------------------------------
create table public.product_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  total numeric(5,2) not null check (total >= 0 and total <= 100),
  confidence numeric(5,2) not null check (confidence >= 0 and confidence <= 100),
  recommendation text not null check (recommendation in (
    'strong_candidate', 'worth_investigating', 'monitor', 'too_competitive',
    'weak_profit', 'insufficient_evidence', 'avoid_for_now')),
  trend_class text not null,
  components jsonb not null,
  confidence_breakdown jsonb not null,
  weights jsonb not null,
  weight_version_id uuid references public.scoring_weight_versions (id) on delete set null,
  formula_version text not null,
  inputs_digest text not null,
  missing text[] not null default '{}',
  reasons text[] not null default '{}',
  is_demo boolean not null default false,
  computed_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index product_scores_latest on public.product_scores (product_id, computed_at desc);
create index product_scores_user on public.product_scores (user_id, computed_at desc);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid,
  kind text not null check (kind in (
    'product_evaluation', 'competitor_analysis', 'content_pattern_analysis', 'comparison',
    'supplier_reliability', 'validation_analysis', 'daily_summary', 'weekly_category',
    'weekly_opportunity')),
  title text not null check (char_length(title) <= 300),
  model text, -- null = deterministic report (no AI)
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index research_reports_user on public.research_reports (user_id, created_at desc);
create index research_reports_product on public.research_reports (product_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Competitors and competitor content
-- ---------------------------------------------------------------------------
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  url text check (url is null or url ~ '^https?://'),
  channel text not null default 'shopify_store'
    check (channel in ('shopify_store', 'amazon', 'tiktok_shop', 'etsy', 'other_marketplace', 'other')),
  price numeric(10,2) check (price is null or price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  positioning text not null default '' check (char_length(positioning) <= 2000),
  presentation_notes text not null default '' check (char_length(presentation_notes) <= 2000),
  description_excerpt text not null default '' check (char_length(description_excerpt) <= 4000),
  review_count int check (review_count is null or review_count >= 0),
  avg_rating numeric(3,2) check (avg_rating is null or (avg_rating >= 0 and avg_rating <= 5)),
  ad_activity text not null default 'unknown' check (ad_activity in ('unknown', 'none_observed', 'some', 'heavy')),
  marketing_angles text[] not null default '{}',
  complaints text[] not null default '{}',
  observed_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index competitors_product on public.competitors (product_id);

create table public.reference_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube', 'other')),
  url text check (url is null or url ~ '^https?://'),
  creator text not null default '' check (char_length(creator) <= 200),
  hook_text text not null default '' check (char_length(hook_text) <= 1000),
  structure_notes text not null default '' check (char_length(structure_notes) <= 4000),
  -- Public counts exactly as displayed on the platform at observed_at; null = not recorded.
  views_observed bigint check (views_observed is null or views_observed >= 0),
  likes_observed bigint check (likes_observed is null or likes_observed >= 0),
  comments_observed bigint check (comments_observed is null or comments_observed >= 0),
  observed_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index reference_videos_product on public.reference_videos (product_id);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  platform text not null default 'other'
    check (platform in ('aliexpress', 'cj_dropshipping', 'alibaba', 'zendrop', 'spocket', 'temu', 'private_agent', 'other')),
  url text check (url is null or url ~ '^https?://'),
  store_rating numeric(3,2) check (store_rating is null or (store_rating >= 0 and store_rating <= 5)),
  store_review_count int check (store_review_count is null or store_review_count >= 0),
  years_active numeric(4,1) check (years_active is null or years_active >= 0),
  location text not null default '' check (char_length(location) <= 120),
  return_policy text not null default '' check (char_length(return_policy) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  supplier_id uuid not null,
  product_id uuid not null,
  url text check (url is null or url ~ '^https?://'),
  unit_cost numeric(10,2) not null check (unit_cost >= 0),
  shipping_cost numeric(10,2) check (shipping_cost is null or shipping_cost >= 0),
  ship_days_min int check (ship_days_min is null or ship_days_min >= 0),
  ship_days_max int check (ship_days_max is null or ship_days_max >= 0),
  moq int check (moq is null or moq >= 1),
  variants text[] not null default '{}',
  has_clear_specs boolean,
  product_rating numeric(3,2) check (product_rating is null or (product_rating >= 0 and product_rating <= 5)),
  product_review_count int check (product_review_count is null or product_review_count >= 0),
  sample_quality int check (sample_quality is null or (sample_quality between 1 and 5)),
  notes text not null default '' check (char_length(notes) <= 4000),
  observed_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ship_days_min is null or ship_days_max is null or ship_days_min <= ship_days_max),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  foreign key (supplier_id, user_id) references public.suppliers (id, user_id) on delete cascade
);
create index supplier_offers_product on public.supplier_offers (product_id);

create table public.supplier_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  offer_ids uuid[] not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Watchlist / alerts / saved searches
-- ---------------------------------------------------------------------------
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  thresholds jsonb not null default '{}'::jsonb,
  baseline_score numeric(5,2),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (user_id, product_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid,
  kind text not null check (kind in (
    'trend_up', 'substantial_growth', 'competition_increase', 'demand_decline',
    'score_change', 'new_research', 'job_failure', 'integration')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null check (char_length(title) <= 300),
  message text not null check (char_length(message) <= 4000),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (user_id, dedupe_key)
);
create index alerts_user_unread on public.alerts (user_id, created_at desc) where read_at is null;

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  query text not null check (char_length(query) between 1 and 300),
  source_key text not null references public.data_sources (key),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'promoted', 'dismissed')),
  product_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_demo boolean not null default false,
  foreign key (product_id, user_id) references public.products (id, user_id) on delete set null (product_id),
  unique (user_id, query)
);

-- ---------------------------------------------------------------------------
-- Testing workspace & performance
-- ---------------------------------------------------------------------------
create table public.testing_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  budget_usd numeric(12,2) check (budget_usd is null or budget_usd >= 0),
  hours_per_week numeric(6,1) check (hours_per_week is null or hours_per_week >= 0),
  hypothesis text not null default '' check (char_length(hypothesis) <= 2000),
  success_criteria text not null default '' check (char_length(success_criteria) <= 2000),
  sample_cost numeric(10,2) check (sample_cost is null or sample_cost >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (user_id, product_id),
  unique (id, user_id)
);
create trigger testing_projects_updated before update on public.testing_projects
  for each row execute function public.set_updated_at();

create table public.content_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube', 'multi')),
  format text not null check (char_length(format) <= 60),
  angle text not null default '' check (char_length(angle) <= 1000),
  status text not null default 'planned' check (status in ('planned', 'producing', 'published', 'paused', 'done')),
  shopify_utm_campaign text check (shopify_utm_campaign is null or shopify_utm_campaign ~ '^[a-z0-9_-]{1,80}$'),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (id, user_id)
);

create table public.published_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  campaign_id uuid,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  url text check (url is null or url ~ '^https?://'),
  title text not null default '' check (char_length(title) <= 300),
  hook text not null default '' check (char_length(hook) <= 500),
  format text not null default '' check (char_length(format) <= 60),
  duration_sec int check (duration_sec is null or duration_sec between 1 and 600),
  published_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  foreign key (campaign_id, user_id) references public.content_campaigns (id, user_id) on delete set null (campaign_id),
  unique (id, user_id)
);
create index published_videos_product on public.published_videos (product_id, published_at desc);

-- Snapshots of a video's metrics over time (cumulative values at captured_at).
create table public.video_performance (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  video_id uuid not null,
  captured_at timestamptz not null,
  views bigint not null default 0 check (views >= 0),
  likes bigint not null default 0 check (likes >= 0),
  comments bigint not null default 0 check (comments >= 0),
  shares bigint not null default 0 check (shares >= 0),
  saves bigint not null default 0 check (saves >= 0),
  profile_visits bigint not null default 0 check (profile_visits >= 0),
  link_clicks bigint not null default 0 check (link_clicks >= 0),
  source text not null default 'manual' check (source in ('manual', 'api', 'demo')),
  created_at timestamptz not null default now(),
  foreign key (video_id, user_id) references public.published_videos (id, user_id) on delete cascade,
  unique (video_id, captured_at)
);

create table public.sales_performance (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  product_id uuid not null,
  period_start date not null,
  period_end date not null,
  sessions int check (sessions is null or sessions >= 0),
  add_to_carts int check (add_to_carts is null or add_to_carts >= 0),
  orders int not null default 0 check (orders >= 0),
  units int check (units is null or units >= 0),
  revenue numeric(12,2) not null default 0 check (revenue >= 0),
  refund_count int not null default 0 check (refund_count >= 0),
  refunds_amount numeric(12,2) not null default 0 check (refunds_amount >= 0),
  ad_spend numeric(12,2) not null default 0 check (ad_spend >= 0),
  source text not null check (source in ('manual', 'shopify', 'demo')),
  created_at timestamptz not null default now(),
  check (period_start <= period_end),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (product_id, period_start, period_end, source)
);

-- Learning loop: explicit decisions and their eventual outcomes.
create table public.product_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  decision text not null check (decision in ('selected', 'rejected', 'continued', 'paused', 'discontinued', 'scaled')),
  reasons text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 4000),
  outcome text check (outcome in ('performed_well', 'performed_poorly', 'inconclusive')),
  actual_margin_pct numeric(6,2),
  score_at_decision numeric(5,2),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);
create index product_decisions_user on public.product_decisions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI: content packs, recommendations, conversations, usage metering
-- ---------------------------------------------------------------------------
create table public.content_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  model text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid,
  context text not null check (context in ('dashboard', 'daily_summary', 'weekly_report', 'validation', 'comparison')),
  recommendation text not null,
  rationale text not null,
  evidence jsonb not null,
  confidence numeric(5,2) not null,
  evidence_hash text not null,
  score_total numeric(5,2),
  outcome text check (outcome in ('performed_well', 'performed_poorly', 'inconclusive', 'not_tested')),
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (user_id, context, evidence_hash)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'store_assistant' check (kind in ('store_assistant')),
  title text not null default 'Store assistant' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index ai_messages_conversation on public.ai_messages (conversation_id, id);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_month on public.ai_usage (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Shopify
-- ---------------------------------------------------------------------------
create table public.shopify_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  shop_domain text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  auth_mode text not null check (auth_mode in ('admin_token', 'client_credentials')),
  api_version text not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  scopes text[] not null default '{}',
  shop_name text,
  currency_code text,
  last_error text,
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shopify_integrations_updated before update on public.shopify_integrations
  for each row execute function public.set_updated_at();

-- Secrets live in a separate table with NO client-role access at all; only the
-- server (connection owner) reads it. Values are AES-256-GCM encrypted with a
-- key that exists only in server environment variables.
create table public.shopify_credentials (
  integration_id uuid primary key references public.shopify_integrations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  client_id text,
  encrypted_client_secret text,
  updated_at timestamptz not null default now()
);

create table public.shopify_product_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  shopify_product_gid text not null check (shopify_product_gid ~ '^gid://shopify/Product/[0-9]+$'),
  shopify_handle text,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade,
  unique (user_id, shopify_product_gid)
);

-- Every consequential store action is a change request: drafted (by the user
-- or the AI), previewed, explicitly approved, applied, and (where supported)
-- rolled back. The backup column holds the pre-change state.
create table public.shopify_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid,
  kind text not null check (kind in (
    'product_create', 'product_update', 'product_status', 'price_update', 'collection_create',
    'page_create', 'landing_page', 'theme_files_upsert')),
  status text not null default 'draft' check (status in (
    'draft', 'applying', 'applied', 'failed', 'rolled_back', 'cancelled')),
  title text not null check (char_length(title) <= 300),
  summary text not null default '' check (char_length(summary) <= 4000),
  payload jsonb not null,
  preview jsonb,
  backup jsonb,
  result jsonb,
  error text,
  created_by text not null check (created_by in ('user', 'ai')),
  approved_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.products (id, user_id) on delete set null (product_id)
);
create index shopify_change_requests_user on public.shopify_change_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Scheduled research jobs
-- ---------------------------------------------------------------------------
create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'daily_discovery', 'watchlist_monitor', 'trend_alerts', 'competitor_update',
    'daily_summary', 'weekly_category_report', 'weekly_opportunity_report', 'shopify_sync')),
  frequency text not null check (frequency in ('daily', 'weekly', 'manual')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  locked_until timestamptz,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind),
  unique (id, user_id)
);
create index research_jobs_due on public.research_jobs (next_run_at) where enabled;

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error text,
  foreign key (job_id, user_id) references public.research_jobs (id, user_id) on delete cascade
);
create index job_runs_job on public.job_runs (job_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Operational tables (server-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_user on public.audit_log (user_id, created_at desc);

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences', 'scoring_weight_versions', 'products', 'product_stage_events',
    'product_assessments', 'trend_observations', 'product_scores', 'research_reports',
    'competitors', 'reference_videos', 'suppliers', 'supplier_offers', 'supplier_comparisons',
    'watchlist_items', 'alerts', 'saved_searches', 'discovery_candidates', 'testing_projects',
    'content_campaigns', 'published_videos', 'video_performance', 'sales_performance',
    'product_decisions', 'content_packs', 'ai_recommendations', 'ai_conversations',
    'ai_messages', 'ai_usage', 'shopify_integrations', 'shopify_product_links',
    'shopify_change_requests', 'research_jobs', 'job_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.categories enable row level security;
create policy categories_read on public.categories for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy categories_write on public.categories for insert to authenticated
  with check (user_id = auth.uid());
create policy categories_update on public.categories for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete on public.categories for delete to authenticated
  using (user_id = auth.uid());

alter table public.data_sources enable row level security;
create policy data_sources_read on public.data_sources for select to authenticated using (true);

-- Server-only tables: RLS on, no policies => no access for anon/authenticated.
alter table public.shopify_credentials enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- Explicit grants (Supabase grants these by default; repeated for clarity and
-- for plain-Postgres test environments).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.shopify_credentials, public.audit_log, public.rate_limits from authenticated;
revoke all on public.shopify_credentials, public.audit_log, public.rate_limits from anon;
revoke insert, update, delete on public.data_sources from authenticated;
