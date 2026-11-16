-- Product overview: each product with its latest score and the component
-- scores used by discovery filters. security_invoker makes the view respect
-- the caller's RLS policies (Postgres 15+).
create or replace view public.product_overview with (security_invoker = true) as
select
  p.*,
  c.name as category_name,
  c.slug as category_slug,
  s.id as score_id,
  s.total as score_total,
  s.confidence as score_confidence,
  s.recommendation,
  s.trend_class,
  s.computed_at as scored_at,
  (select (x ->> 'score')::numeric from jsonb_array_elements(s.components) x where x ->> 'key' = 'demand') as demand_score,
  (select (x ->> 'score')::numeric from jsonb_array_elements(s.components) x where x ->> 'key' = 'content') as content_score,
  (select (x ->> 'score')::numeric from jsonb_array_elements(s.components) x where x ->> 'key' = 'profit') as profit_score,
  (select (x ->> 'score')::numeric from jsonb_array_elements(s.components) x where x ->> 'key' = 'competition') as competition_score,
  (select (x -> 'inputs' ->> 'growthPct')::numeric from jsonb_array_elements(s.components) x where x ->> 'key' = 'demand') as growth_pct,
  case
    when p.est_selling_price > 0 and p.est_supplier_cost is not null
    then round(((p.est_selling_price - p.est_supplier_cost - coalesce(p.est_shipping_cost, 0)) / p.est_selling_price * 100)::numeric, 1)
  end as est_gross_margin_pct,
  exists (select 1 from public.watchlist_items w where w.product_id = p.id) as on_watchlist
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select * from public.product_scores ps where ps.product_id = p.id order by ps.computed_at desc limit 1
) s on true;

grant select on public.product_overview to authenticated;
