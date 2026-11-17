import Link from "next/link";
import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { listObservations, METRICS, type MetricKey } from "@/lib/services/observations";
import { analyzeTrend, filterRange, TREND_LABELS, windowChange, type RangeKey } from "@/lib/analytics/trends";
import { sourceStatuses, MANUAL_WORKFLOWS } from "@/lib/sources/registry";
import { Badge, Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui/primitives";
import { Provenance, TrendBadge } from "@/components/ui/domain";
import { TimeSeriesChart } from "@/components/charts/line-chart";
import { cn, fmtDate, fmtNum, fmtPct } from "@/lib/utils";
import { CollectPanel, CsvImport, DeleteObservation, ManualObservationForm } from "./trends-client";

const RANGES: RangeKey[] = ["7d", "30d", "90d", "12m", "all"];

export async function TrendsTab({ userId, product: p, range: rangeParam }: { userId: string; product: ProductOverview; range?: string }) {
  const range: RangeKey = RANGES.includes(rangeParam as RangeKey) ? (rangeParam as RangeKey) : "12m";
  const obs = await withUser(userId, (db) => listObservations(db, p.id));
  const now = new Date();

  const groups = new Map<string, typeof obs>();
  for (const o of obs) {
    const k = `${o.metric}|${o.sourceKey}|${o.query}|${o.geo}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const series = [...groups.entries()].map(([k, rows]) => ({
    key: k,
    metric: rows[0].metric as MetricKey,
    sourceName: rows[0].sourceName,
    sourceKind: rows[0].sourceKind,
    query: rows[0].query,
    geo: rows[0].geo,
    isDemo: rows.some((r) => r.isDemo),
    isEstimate: rows.some((r) => r.isEstimate),
    points: rows.map((r) => ({ date: r.observedAt.toISOString(), value: r.value })),
    lastCollected: rows.reduce((a, r) => (r.collectedAt > a ? r.collectedAt : a), rows[0].collectedAt),
  }));
  const search = series.filter((s) => s.metric === "search_interest").sort((a, b) => b.points.length - a.points.length);
  const others = series.filter((s) => s.metric !== "search_interest");
  const primary = search[0];
  const analysis = primary ? analyzeTrend(primary.points) : null;
  const change = primary ? windowChange(primary.points, range, now) : null;
  const statuses = sourceStatuses();

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader
            title="Search interest over time"
            description={primary ? `${primary.sourceName} · “${primary.query}” · ${primary.geo} · ${primary.points.length} points` : "No search-interest data yet"}
            action={
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <Link key={r} scroll={false} href={`/products/${p.id}?tab=trends&range=${r}`} className={cn("rounded-md px-2 py-1 text-xs", r === range ? "bg-accent/20 text-fg" : "text-muted hover:text-fg")}>
                    {r === "all" ? "All" : r}
                  </Link>
                ))}
              </div>
            }
          />
          <CardBody>
            {!primary ? (
              <Notice tone="warn" title="Insufficient data">Collect from Google Trends (SerpApi) or import a CSV export from trends.google.com to analyse demand. No values are simulated.</Notice>
            ) : (
              <>
                {primary.isDemo && <div className="mb-3"><Notice tone="demo">Synthetic demo series — illustrates the analysis only.</Notice></div>}
                <TimeSeriesChart
                  series={search.slice(0, 5).map((s) => ({ key: s.key, name: `${s.query || "query"} (${s.sourceName}${s.isDemo ? ", DEMO" : ""})`, points: filterRange(s.points, range, now) }))}
                  yDomain={[0, 100]}
                  valueLabel="/100"
                />
                {search.length > 1 && <p className="mt-2 text-[11px] text-faint">Each Google Trends series is indexed 0–100 relative to its own peak for that query and window — compare shapes, not levels.</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Metric label={`Change vs previous ${range === "all" ? "period" : range}`} value={change?.pct === null || change?.pct === undefined ? "n/a" : fmtPct(change.pct, 1, true)} hint={change?.reason} />
                  <Metric label="Classification" value={analysis ? TREND_LABELS[analysis.classification] : "—"} />
                  <Metric label="Recent vs baseline" value={analysis?.growthPct === null || !analysis ? "n/a" : fmtPct(analysis.growthPct, 1, true)} hint={analysis ? `recent mean ${analysis.recentMean ?? "—"} vs baseline ${analysis.baselineMean ?? "—"}` : undefined} />
                  <Metric label="Seasonality" value={analysis?.seasonality.detected ? `Peaks: month ${analysis.seasonality.peakMonths.join(", ")}` : analysis && analysis.spanDays >= 700 ? "Not detected" : "Needs 2+ years"} />
                </div>
                {analysis && (
                  <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-muted">
                    {analysis.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    {analysis.volatility !== null && <li>Volatility (coefficient of variation): {analysis.volatility}</li>}
                    <li>Acceleration (second half vs first half of recent window): {analysis.accelerationPct === null ? "n/a" : fmtPct(analysis.accelerationPct, 1, true)}</li>
                  </ul>
                )}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Social, advertising & marketplace indicators" description="Each indicator is shown with its source and type. Sample-based metrics are labelled as such." />
          <CardBody className="space-y-5">
            {others.length === 0 && <p className="text-xs text-muted">No indicators recorded yet. Use the collection panel or record manual observations.</p>}
            {others.map((s) => {
              const last = s.points[s.points.length - 1];
              const first = s.points[0];
              const pct = s.points.length >= 2 && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;
              return (
                <div key={s.key}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-fg">{METRICS[s.metric]?.label ?? s.metric}</span>
                    <Provenance kind={s.sourceKind} estimate={s.isEstimate} demo={s.isDemo} />
                    <span className="text-faint">{s.sourceName}{s.query ? ` · “${s.query}”` : ""} · {s.points.length} obs.</span>
                    <span className="ml-auto tabular-nums">latest {fmtNum(last.value)} <span className="text-faint">({fmtDate(last.date)})</span></span>
                    {pct !== null && <Badge tone={pct >= 0 ? "info" : "warn"}>{fmtPct(pct, 0, true)} since first</Badge>}
                  </div>
                  {s.points.length >= 3 ? <TimeSeriesChart series={[{ key: s.key, name: METRICS[s.metric]?.label ?? s.metric, points: s.points }]} height={140} /> : <p className="text-[11px] text-faint">A trend line appears after 3+ observations (collect again on later days).</p>}
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`All observations (${obs.length})`} description="Append-only history. Duplicates (same source, metric, query and date) are skipped automatically." />
          <Table className="max-h-96 overflow-y-auto">
            <thead><tr><Th>Observed</Th><Th>Metric</Th><Th>Source</Th><Th>Type</Th><Th className="text-right">Value</Th><Th>Collected</Th><Th /></tr></thead>
            <tbody>
              {[...obs].reverse().slice(0, 300).map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(o.observedAt)}</Td>
                  <Td className="text-xs">{o.metric}{o.query && <span className="text-faint"> · {o.query}</span>}</Td>
                  <Td className="text-xs">{o.sourceUrl ? <a className="text-accent hover:underline" href={o.sourceUrl} target="_blank" rel="noreferrer noopener">{o.sourceName}</a> : o.sourceName}</Td>
                  <Td><Provenance kind={o.sourceKind} estimate={o.isEstimate} demo={o.isDemo} /></Td>
                  <Td className="text-right tabular-nums">{fmtNum(o.value, 2)}</Td>
                  <Td className="whitespace-nowrap text-xs text-faint">{fmtDate(o.collectedAt, true)}</Td>
                  <Td>{o.sourceKind === "manual" && <DeleteObservation id={o.id} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="space-y-5">
        <CollectPanel productId={p.id} defaultQuery={p.keywords[0] ?? p.name} statuses={statuses} />
        <CsvImport productId={p.id} />
        <ManualObservationForm productId={p.id} metrics={Object.entries(METRICS).map(([k, v]) => ({ key: k, label: v.label }))} />
        <Card>
          <CardHeader title="Manual research workflows" description="For sources without a public API" />
          <CardBody className="space-y-3 text-xs text-muted">
            {MANUAL_WORKFLOWS.map((w) => (
              <details key={w.key}>
                <summary className="cursor-pointer font-medium text-fg">{w.name}</summary>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">{w.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </details>
            ))}
          </CardBody>
        </Card>
        <p className="text-[11px] text-faint">Trend classification rules: ≥8 points over ≥49 days required; rapidly rising ≥ +100%, emerging ≥ +25%, declining ≤ −20% (recent quarter of points vs the preceding half); seasonal when two consecutive years correlate ≥ 0.6. Current classification: <TrendBadge value={p.trendClass} /></p>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 px-3 py-2" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-faint">{hint}</p>}
    </div>
  );
}
