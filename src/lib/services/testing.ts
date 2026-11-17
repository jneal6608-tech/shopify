import "server-only";
import type { Db } from "../db";
import { analyzeValidation, planTestingPriorities, type SalesTotals, type VideoSnapshot } from "../analytics/validation";
import { computeUnitEconomics, DEFAULT_PROFIT_INPUT } from "../analytics/profit";
import { TESTING_STAGES } from "../validation/common";

export async function ensureTestingProject(db: Db, userId: string, productId: string) {
  await db`insert into public.testing_projects (user_id, product_id) values (${userId}, ${productId})
           on conflict (user_id, product_id) do nothing`;
}

/** Latest snapshot per video (metrics are cumulative). */
export async function videoSnapshots(db: Db, productId: string): Promise<Array<VideoSnapshot & { url: string | null; publishedAt: Date; campaignId: string | null; isDemo: boolean; snapshots: number; capturedAt: Date | null; durationSec: number | null }>> {
  return db`
    select v.id as video_id, v.platform, v.hook, v.format, v.title, v.url, v.published_at, v.campaign_id, v.is_demo, v.duration_sec,
      coalesce(p.views, 0) as views, coalesce(p.likes, 0) as likes, coalesce(p.comments, 0) as comments, coalesce(p.shares, 0) as shares,
      coalesce(p.saves, 0) as saves, coalesce(p.profile_visits, 0) as profile_visits, coalesce(p.link_clicks, 0) as link_clicks,
      p.captured_at, (select count(*)::int from public.video_performance x where x.video_id = v.id) as snapshots
    from public.published_videos v
    left join lateral (select * from public.video_performance vp where vp.video_id = v.id order by captured_at desc limit 1) p on true
    where v.product_id = ${productId}
    order by v.published_at desc` as never;
}

export async function salesTotals(db: Db, productId: string): Promise<SalesTotals & { periods: number; sources: string[] }> {
  // Prefer Shopify-synced data per period; manual rows fill periods Shopify does not cover.
  const [r] = await db<Array<SalesTotals & { periods: number; sources: string[] }>>`
    with rows as (
      select * from public.sales_performance s where s.product_id = ${productId}
        and not (s.source = 'manual' and exists (
          select 1 from public.sales_performance o where o.product_id = s.product_id and o.source = 'shopify'
            and o.period_start <= s.period_end and o.period_end >= s.period_start))
    )
    select
      case when count(sessions) = 0 then null else sum(sessions)::int end as sessions,
      case when count(add_to_carts) = 0 then null else sum(add_to_carts)::int end as add_to_carts,
      coalesce(sum(orders), 0)::int as orders, coalesce(sum(revenue), 0)::numeric as revenue,
      coalesce(sum(refund_count), 0)::int as refund_count, coalesce(sum(refunds_amount), 0)::numeric as refunds_amount,
      coalesce(sum(ad_spend), 0)::numeric as ad_spend, count(*)::int as periods, coalesce(array_agg(distinct source), '{}') as sources
    from rows`;
  return r;
}

export async function validationFor(db: Db, productId: string) {
  const videos = await videoSnapshots(db, productId);
  const sales = await salesTotals(db, productId);
  const [p] = await db<{ estSellingPrice: number | null; estSupplierCost: number | null; estShippingCost: number | null }[]>`
    select est_selling_price, est_supplier_cost, est_shipping_cost from public.products where id = ${productId}`;
  const [prefs] = await db<{ feeSettings: Record<string, number> }[]>`select fee_settings from public.user_preferences`;
  const unit =
    p && p.estSellingPrice !== null && p.estSupplierCost !== null
      ? computeUnitEconomics({ ...DEFAULT_PROFIT_INPUT, ...(prefs?.feeSettings ?? {}), sellingPrice: p.estSellingPrice, supplierCost: p.estSupplierCost, shippingCost: p.estShippingCost ?? 0 }).contributionBeforeMarketing
      : null;
  return { videos, sales, result: analyzeValidation(videos, sales, unit), unitContribution: unit };
}

export async function testingBoard(db: Db) {
  return db<Array<{ productId: string; name: string; stage: string; isDemo: boolean; scoreTotal: number | null; scoreConfidence: number | null; budgetUsd: number | null; sampleCost: number | null; startedAt: Date | null; videos: number; views: number; orders: number; revenue: number }>>`
    select p.id as product_id, p.name, p.stage, p.is_demo, p.score_total, p.score_confidence, t.budget_usd, t.sample_cost, t.started_at,
      (select count(*)::int from public.published_videos v where v.product_id = p.id) as videos,
      coalesce((select sum(x.views)::bigint from (select distinct on (vp.video_id) vp.views from public.video_performance vp join public.published_videos v on v.id = vp.video_id where v.product_id = p.id order by vp.video_id, vp.captured_at desc) x), 0) as views,
      coalesce((select sum(orders)::int from public.sales_performance s where s.product_id = p.id), 0) as orders,
      coalesce((select sum(revenue) from public.sales_performance s where s.product_id = p.id), 0) as revenue
    from public.product_overview p left join public.testing_projects t on t.product_id = p.id
    where p.stage = any(${[...TESTING_STAGES, "discontinued"]}::text[]) or t.id is not null
    order by p.updated_at desc`;
}

export async function priorityPlan(db: Db) {
  const [prefs] = await db<{ testingBudgetUsd: number | null; weeklyHours: number | null }[]>`select testing_budget_usd, weekly_hours from public.user_preferences`;
  const candidates = await db<Array<{ productId: string; name: string; stage: string; opportunity: number | null; confidence: number | null; sampleCost: number | null }>>`
    select p.id as product_id, p.name, p.stage, p.score_total as opportunity, p.score_confidence as confidence,
      coalesce(t.sample_cost, (select min(o.unit_cost + coalesce(o.shipping_cost, 0)) from public.supplier_offers o where o.product_id = p.id)) as sample_cost
    from public.product_overview p left join public.testing_projects t on t.product_id = p.id
    where p.stage not in ('archived', 'discontinued')
      and (p.stage = any(${TESTING_STAGES}::text[]) or p.recommendation in ('strong_candidate', 'worth_investigating'))
    order by p.score_total desc nulls last limit 30`;
  const withVerdicts = [];
  for (const c of candidates) {
    const v = TESTING_STAGES.includes(c.stage as never) ? (await validationFor(db, c.productId)).result.verdict : null;
    withVerdicts.push({ ...c, verdict: v });
  }
  return { plan: planTestingPriorities(withVerdicts, prefs?.testingBudgetUsd ?? null, prefs?.weeklyHours ?? null), prefs };
}
