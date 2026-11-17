import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { marketPosition } from "@/lib/analytics/market";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, scoreTone } from "@/components/ui/domain";
import { cn, fmtDate, fmtMoney, fmtNum } from "@/lib/utils";

export const metadata = { title: "Competitor Research" };

export default async function CompetitorsPage() {
  const user = await requireUser();
  const { rows, reports } = await withUser(user.id, async (db) => ({
    rows: await db<Array<{ id: string; name: string; isDemo: boolean; competitionScore: number | null; trendClass: string | null; estSellingPrice: number | null; competitors: number; minPrice: number | null; maxPrice: number | null; medianPrice: number | null; heavyAds: number; reviews: number | null; latest: Date | null; activeAds: number | null }>>`
      select p.id, p.name, p.is_demo, p.competition_score, p.trend_class, p.est_selling_price,
        count(c.id)::int as competitors, min(c.price) as min_price, max(c.price) as max_price,
        percentile_cont(0.5) within group (order by c.price) as median_price,
        count(*) filter (where c.ad_activity = 'heavy')::int as heavy_ads, max(c.review_count) as reviews, max(c.observed_at) as latest,
        (select o.value from public.trend_observations o where o.product_id = p.id and o.metric = 'meta_active_ads' order by o.observed_at desc limit 1) as active_ads
      from public.product_overview p left join public.competitors c on c.product_id = p.id
      where p.stage <> 'archived' group by p.id, p.name, p.is_demo, p.competition_score, p.trend_class, p.est_selling_price
      order by count(c.id) desc, p.name`,
    reports: await db<Array<{ id: string; title: string; createdAt: Date }>>`select id, title, created_at from public.research_reports where kind in ('competitor_analysis', 'content_pattern_analysis') order by created_at desc limit 10`,
  }));
  return (
    <>
      <PageHeader title="Competitor Research" description="Competitive landscape for every product. Market position is derived from measured indicators; competitor sales and profitability are never assumed." />
      {rows.length === 0 ? <Empty title="No products yet" /> : (
        <Card className="mb-6">
          <Table>
            <thead><tr><Th>Product</Th><Th>Market position</Th><Th className="text-right">Competition score</Th><Th className="text-right">Tracked</Th><Th className="text-right">Active ads (EU)</Th><Th className="text-right">Price range</Th><Th className="text-right">Median vs yours</Th><Th className="text-right">Max reviews</Th><Th>Updated</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const pos = marketPosition(r.competitionScore, r.trendClass);
                return (
                  <tr key={r.id}>
                    <Td><Link href={`/products/${r.id}?tab=competitors`} className="font-medium hover:text-accent">{r.name}</Link> {r.isDemo && <DemoBadge />}</Td>
                    <Td><Badge tone={pos.tone}>{pos.label}</Badge></Td>
                    <Td className={cn("text-right tabular-nums", scoreTone(r.competitionScore))}>{r.competitionScore === null ? "—" : Math.round(r.competitionScore)}</Td>
                    <Td className="text-right">{r.competitors}{r.heavyAds > 0 && <span className="text-[11px] text-bad"> · {r.heavyAds} heavy ads</span>}</Td>
                    <Td className="text-right tabular-nums">{fmtNum(r.activeAds)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-muted">{r.minPrice === null ? "—" : `${fmtMoney(r.minPrice)}–${fmtMoney(r.maxPrice)}`}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(r.medianPrice)} <span className="text-faint">/ {fmtMoney(r.estSellingPrice)}</span></Td>
                    <Td className="text-right tabular-nums">{fmtNum(r.reviews)}</Td>
                    <Td className="text-xs text-faint">{fmtDate(r.latest)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader title="Recent competitor & content-pattern reports" />
        <div className="divide-y divide-border">
          {reports.length === 0 && <p className="px-4 py-4 text-xs text-muted">No reports yet. Generate them from a product's Competitors or Content tab.</p>}
          {reports.map((r) => <Link key={r.id} href={`/reports/${r.id}`} className="flex justify-between px-4 py-2 text-sm hover:bg-panel-2"><span>{r.title}</span><span className="text-xs text-faint">{fmtDate(r.createdAt, true)}</span></Link>)}
        </div>
      </Card>
    </>
  );
}
