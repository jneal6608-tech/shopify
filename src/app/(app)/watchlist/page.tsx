import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { DEFAULT_ALERT_THRESHOLDS, type AlertThresholds } from "@/lib/analytics/alerts";
import { Badge, Card, CardBody, CardHeader, Empty, PageHeader, Table, TabLinks, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, scoreTone, TrendBadge } from "@/components/ui/domain";
import { ActionButton } from "@/components/ui/action";
import { cn, fmtDate, fmtPct, relTime } from "@/lib/utils";
import { ThresholdEditor } from "./thresholds";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "alerts" ? "alerts" : "watching";
  const data = await withUser(user.id, async (db) => ({
    items: await db<Array<{ productId: string; name: string; isDemo: boolean; thresholds: Partial<AlertThresholds>; baselineScore: number | null; addedAt: Date; scoreTotal: number | null; scoreConfidence: number | null; trendClass: string | null; growthPct: number | null; competitionScore: number | null; scoredAt: Date | null; lastObs: Date | null; changes: number }>>`
      select w.product_id, p.name, p.is_demo, w.thresholds, w.baseline_score, w.created_at as added_at, p.score_total, p.score_confidence, p.trend_class,
        p.growth_pct, p.competition_score, p.scored_at,
        (select max(collected_at) from public.trend_observations o where o.product_id = w.product_id) as last_obs,
        (select count(*)::int from public.product_scores s where s.product_id = w.product_id and s.computed_at >= w.created_at) as changes
      from public.watchlist_items w join public.product_overview p on p.id = w.product_id order by p.score_total desc nulls last`,
    alerts: await db<Array<{ id: string; productId: string | null; kind: string; severity: string; title: string; message: string; readAt: Date | null; createdAt: Date }>>`
      select * from public.alerts order by created_at desc limit 200`,
    prefs: (await db<{ alertThresholds: Partial<AlertThresholds> }[]>`select alert_thresholds from public.user_preferences`)[0],
  }));
  const unread = data.alerts.filter((a) => !a.readAt).length;
  const defaults = { ...DEFAULT_ALERT_THRESHOLDS, ...(data.prefs?.alertThresholds ?? {}) };
  return (
    <>
      <PageHeader
        title="Watchlist"
        description="Products you are monitoring. The daily watchlist job collects fresh data from connected sources, rescores, and raises alerts when your thresholds are crossed."
        actions={<ActionButton variant="secondary" endpoint="/api/jobs/run" body={{ kind: "watchlist_monitor" }}>Run monitor now</ActionButton>}
      />
      <TabLinks active={tab} tabs={[{ key: "watching", label: "Watching", href: "/watchlist", count: data.items.length }, { key: "alerts", label: "Alerts", href: "/watchlist?tab=alerts", count: unread }]} />
      {tab === "watching" ? (
        data.items.length === 0 ? (
          <Empty title="Nothing on your watchlist">Open a product and click “Watch”.</Empty>
        ) : (
          <Card>
            <Table>
              <thead><tr><Th>Product</Th><Th className="text-right">Score now</Th><Th className="text-right">Since added</Th><Th>Trend</Th><Th className="text-right">Growth</Th><Th className="text-right">Competition</Th><Th>Last data</Th><Th>Alert thresholds</Th><Th /></tr></thead>
              <tbody>
                {data.items.map((w) => {
                  const delta = w.scoreTotal !== null && w.baselineScore !== null ? w.scoreTotal - w.baselineScore : null;
                  const t = { ...defaults, ...w.thresholds };
                  return (
                    <tr key={w.productId}>
                      <Td><Link href={`/products/${w.productId}`} className="font-medium hover:text-accent">{w.name}</Link> {w.isDemo && <DemoBadge />}<div className="text-[11px] text-faint">added {fmtDate(w.addedAt)} · {w.changes} score update(s)</div></Td>
                      <Td className={cn("text-right font-semibold tabular-nums", scoreTone(w.scoreTotal))}>{w.scoreTotal === null ? "—" : Math.round(w.scoreTotal)}<span className="ml-1 text-[11px] font-normal text-faint">c{w.scoreConfidence === null ? "—" : Math.round(w.scoreConfidence)}</span></Td>
                      <Td className={cn("text-right tabular-nums", delta === null ? "text-faint" : delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-muted")}>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}</Td>
                      <Td><TrendBadge value={w.trendClass} /></Td>
                      <Td className="text-right tabular-nums">{fmtPct(w.growthPct, 0, true)}</Td>
                      <Td className={cn("text-right tabular-nums", scoreTone(w.competitionScore))}>{w.competitionScore === null ? "—" : Math.round(w.competitionScore)}</Td>
                      <Td className="text-xs text-muted">{relTime(w.lastObs)}</Td>
                      <Td className="text-[11px] text-faint">score ±{t.scoreChange} · growth ≥{t.substantialGrowthPct}% · decline ≤{t.declinePct}% · ads +{t.competitionIncreasePct}%</Td>
                      <Td className="whitespace-nowrap"><ThresholdEditor productId={w.productId} initial={t} /><ActionButton size="sm" variant="ghost" endpoint={`/api/watchlist/${w.productId}`} method="DELETE">Remove</ActionButton></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )
      ) : (
        <Card>
          <CardHeader title="Alerts" description="Each change is reported once (deduplicated)." action={unread > 0 && <ActionButton size="sm" variant="secondary" endpoint="/api/alerts/read">Mark all read</ActionButton>} />
          {data.alerts.length === 0 ? <CardBody><p className="text-xs text-muted">No alerts yet.</p></CardBody> : (
            <div className="divide-y divide-border">
              {data.alerts.map((a) => (
                <div key={a.id} className={cn("flex items-start gap-3 px-4 py-3", !a.readAt && "bg-accent/5")}>
                  <Badge tone={a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "info"}>{a.kind.replace(/_/g, " ")}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.productId ? <Link href={`/products/${a.productId}`} className="hover:text-accent">{a.title}</Link> : a.title}</p>
                    <p className="text-xs text-muted">{a.message}</p>
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-faint">{fmtDate(a.createdAt, true)}</span>
                  {!a.readAt && <ActionButton size="sm" variant="ghost" endpoint="/api/alerts/read" body={{ ids: [a.id] }}>✓</ActionButton>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
