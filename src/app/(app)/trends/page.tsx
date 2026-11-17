import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { listDataSources } from "@/lib/services/observations";
import { sourceStatuses, MANUAL_WORKFLOWS } from "@/lib/sources/registry";
import { TREND_LABELS, type TrendClass } from "@/lib/analytics/trends";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, scoreTone, TrendBadge } from "@/components/ui/domain";
import { TimeSeriesChart } from "@/components/charts/line-chart";
import { cn, fmtDate, fmtPct, relTime } from "@/lib/utils";

export const metadata = { title: "Trend Intelligence" };

export default async function TrendsPage() {
  const user = await requireUser();
  const d = await withUser(user.id, async (db) => {
    const products = await db<Array<{ id: string; name: string; isDemo: boolean; trendClass: string | null; growthPct: number | null; demandScore: number | null; scoredAt: Date | null; points: number; lastObs: Date | null }>>`
      select p.id, p.name, p.is_demo, p.trend_class, p.growth_pct, p.demand_score, p.scored_at,
        (select count(*)::int from public.trend_observations o where o.product_id = p.id and o.metric = 'search_interest') as points,
        (select max(observed_at) from public.trend_observations o where o.product_id = p.id) as last_obs
      from public.product_overview p where p.stage <> 'archived' order by p.growth_pct desc nulls last`;
    const top = products.filter((p) => p.points >= 8).slice(0, 5);
    const series = [];
    for (const p of top) {
      const pts = await db<{ observedAt: Date; value: number }[]>`
        select observed_at, value from public.trend_observations where product_id = ${p.id} and metric = 'search_interest'
          and (source_key, query) = (select source_key, query from public.trend_observations where product_id = ${p.id} and metric = 'search_interest'
                                     group by source_key, query order by count(*) desc limit 1)
          and observed_at >= now() - interval '12 months'
        order by observed_at`;
      series.push({ key: p.id, name: p.name + (p.isDemo ? " (DEMO)" : ""), points: pts.map((x) => ({ date: x.observedAt.toISOString(), value: x.value })) });
    }
    const changes = await db<Array<{ id: string; title: string; message: string; kind: string; createdAt: Date; productId: string | null }>>`
      select id, title, message, kind, created_at, product_id from public.alerts where kind in ('trend_up','substantial_growth','demand_decline','competition_increase') order by created_at desc limit 10`;
    return { products, series, changes, sources: await listDataSources(db) };
  });
  const counts = d.products.reduce<Record<string, number>>((a, p) => ({ ...a, [p.trendClass ?? "insufficient_data"]: (a[p.trendClass ?? "insufficient_data"] ?? 0) + 1 }), {});
  const statuses = sourceStatuses();
  return (
    <>
      <PageHeader title="Trend Intelligence" description="Emerging and declining demand across your research, classified by transparent rules from measured search-interest data. Products without enough data are labelled “Insufficient data”, never guessed." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {(["emerging", "rapidly_rising", "stable", "seasonal", "saturating", "declining", "insufficient_data"] as TrendClass[]).map((k) => <Stat key={k} label={TREND_LABELS[k]} value={counts[k] ?? 0} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Fastest-growing products — search interest, last 12 months" description="Each Google Trends series is indexed 0–100 to its own peak: compare shapes, not levels." />
            <CardBody>{d.series.length ? <TimeSeriesChart series={d.series} yDomain={[0, 100]} height={300} /> : <p className="text-xs text-muted">No product has 8+ search-interest points yet.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="All products by demand" />
            <Table>
              <thead><tr><Th>Product</Th><Th>Classification</Th><Th className="text-right">Growth</Th><Th className="text-right">Demand score</Th><Th className="text-right">Data points</Th><Th>Latest observation</Th></tr></thead>
              <tbody>
                {d.products.map((p) => (
                  <tr key={p.id}>
                    <Td><Link href={`/products/${p.id}?tab=trends`} className="font-medium hover:text-accent">{p.name}</Link> {p.isDemo && <DemoBadge />}</Td>
                    <Td><TrendBadge value={p.trendClass} /></Td>
                    <Td className="text-right tabular-nums">{fmtPct(p.growthPct, 0, true)}</Td>
                    <Td className={cn("text-right tabular-nums", scoreTone(p.demandScore))}>{p.demandScore === null ? "—" : Math.round(p.demandScore)}</Td>
                    <Td className="text-right tabular-nums">{p.points}</Td>
                    <Td className="text-xs text-faint">{fmtDate(p.lastObs)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Important trend changes" />
            <CardBody className="space-y-2 text-xs">
              {d.changes.length === 0 && <p className="text-muted">No changes detected yet. Changes appear after scheduled monitoring rescores products.</p>}
              {d.changes.map((c) => <div key={c.id}><p className="font-medium">{c.productId ? <Link href={`/products/${c.productId}`} className="hover:text-accent">{c.title}</Link> : c.title}</p><p className="text-muted">{c.message} <span className="text-faint">· {relTime(c.createdAt)}</span></p></div>)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Data sources" description="Reliability weights feed the confidence score" />
            <CardBody className="space-y-2 text-xs">
              {d.sources.filter((s) => s.kind !== "demo").map((s) => {
                const st = statuses.find((x) => x.key === s.key);
                return (
                  <div key={s.key} className="flex items-start gap-2">
                    <Badge tone={st ? (st.configured ? "good" : "neutral") : s.kind === "ai" ? "accent" : "info"}>{st ? (st.configured ? "connected" : "not configured") : s.kind}</Badge>
                    <div><p className="text-fg">{s.name} <span className="text-faint">· reliability {s.reliability}</span></p><p className="text-faint">{s.description}</p></div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Manual workflows" />
            <CardBody className="space-y-2 text-xs text-muted">{MANUAL_WORKFLOWS.map((w) => <details key={w.key}><summary className="cursor-pointer text-fg">{w.name}</summary><ol className="mt-1 list-decimal pl-5">{w.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></details>)}</CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
