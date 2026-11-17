import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { recordRecommendation, strongestOpportunity } from "@/lib/services/insights";
import { listProducts } from "@/lib/services/products";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { DemoBadge, Provenance, RecommendationBadge, scoreTone, TrendBadge } from "@/components/ui/domain";
import { ActionButton } from "@/components/ui/action";
import { cn, fmtDate, relTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await withUser(user.id, async (db) => {
    const [stats] = await db<Array<{ total: number; up: number; down: number; watch: number; testing: number; promising: number; discontinued: number; demo: number }>>`
      select count(*) filter (where stage <> 'archived')::int as total,
        count(*) filter (where trend_class in ('emerging','rapidly_rising') and stage <> 'archived')::int as up,
        count(*) filter (where trend_class = 'declining' and stage <> 'archived')::int as down,
        count(*) filter (where on_watchlist)::int as watch,
        count(*) filter (where stage in ('selected_for_testing','sample_ordered','sample_received','content_production','testing'))::int as testing,
        count(*) filter (where stage in ('promising','scaling_consideration'))::int as promising,
        count(*) filter (where stage = 'discontinued')::int as discontinued,
        count(*) filter (where is_demo)::int as demo
      from public.product_overview`;
    const rec = await strongestOpportunity(db);
    if (rec) await recordRecommendation(db, user.id, "dashboard", rec);
    return {
      stats,
      rec,
      recent: await listProducts(db, { sort: "newest", limit: 6 }),
      reports: await db<{ id: string; title: string; kind: string; model: string | null; createdAt: Date }[]>`select id, title, kind, model, created_at from public.research_reports order by created_at desc limit 6`,
      changes: await db<{ id: string; title: string; message: string; productId: string | null; createdAt: Date }[]>`select id, title, message, product_id, created_at from public.alerts where kind in ('trend_up','substantial_growth','demand_decline') order by created_at desc limit 5`,
      alerts: await db<{ id: string; title: string; kind: string; severity: string; productId: string | null; createdAt: Date }[]>`select id, title, kind, severity, product_id, created_at from public.alerts where read_at is null order by created_at desc limit 6`,
      candidates: await db<{ id: string; query: string; lastSeenAt: Date }[]>`select id, query, last_seen_at from public.discovery_candidates where status = 'new' order by first_seen_at desc limit 5`,
      summary: (await db<{ id: string; createdAt: Date }[]>`select id, created_at from public.research_reports where kind = 'daily_summary' order by created_at desc limit 1`)[0],
    };
  });
  const s = d.stats;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your research operation. Every number here is computed from recorded evidence; nothing is simulated."
        actions={<><ButtonLink href="/discover" variant="primary">Discover products</ButtonLink>{d.summary && <ButtonLink href={`/reports/${d.summary.id}`}>Latest daily summary</ButtonLink>}</>}
      />
      {s.total === 0 && (
        <div className="mb-5">
          <Notice title="Welcome — your research workspace is empty">
            Add a product on <Link className="text-accent" href="/discover">Discover</Link>, connect data sources in <Link className="text-accent" href="/settings#integrations">Settings</Link>, or load clearly labelled demo data to explore the platform.
            <span className="mt-2 block"><ActionButton size="sm" variant="secondary" endpoint="/api/demo">Load demo data</ActionButton></span>
          </Notice>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Researched products" value={s.total} sub={s.demo ? `${s.demo} demo` : undefined} />
        <Stat label="Trending upward" value={s.up} tone={s.up ? "good" : undefined} />
        <Stat label="Declining interest" value={s.down} tone={s.down ? "bad" : undefined} />
        <Stat label="On watchlist" value={s.watch} />
        <Stat label="Being tested" value={s.testing} />
        <Stat label="Validated promising" value={s.promising} tone={s.promising ? "good" : undefined} />
        <Stat label="Discontinued" value={s.discontinued} />
      </div>

      <Card className="mb-6 border-accent/30">
        <CardHeader title="Today's recommendation" description="Selected by formula (evidence-weighted opportunity score with confidence ≥ 50), explained from component scores" />
        <CardBody>
          {!d.rec ? (
            <p className="text-sm text-muted">No product currently meets the bar (score “worth investigating” or better with confidence ≥ 50). Collect more evidence for your candidates — confidence rises with complete, fresh, multi-source data.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                {d.rec.isDemo && <div className="mb-2"><DemoBadge /></div>}
                <p className="text-sm leading-relaxed text-fg">{d.rec.text}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                  <span>Opportunity <span className={cn("font-semibold", scoreTone(d.rec.score))}>{Math.round(d.rec.score)}</span></span>
                  <span>Confidence <span className="font-semibold text-fg">{Math.round(d.rec.confidence)}</span></span>
                  <span className="text-faint">scored {fmtDate(d.rec.computedAt, true)}</span>
                </div>
                <div className="mt-3 flex gap-2"><ButtonLink size="sm" variant="primary" href={`/products/${d.rec.productId}`}>Open research</ButtonLink><ButtonLink size="sm" href={`/products/${d.rec.productId}?tab=content`}>Content ideas</ButtonLink></div>
              </div>
              <div className="lg:col-span-2">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Supporting evidence</p>
                <ul className="space-y-1.5">
                  {d.rec.evidence.map((e) => (
                    <li key={e.label} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-48 text-muted">{e.label}</span>
                      <span className="font-medium tabular-nums">{e.value}</span>
                      <Provenance kind={e.basis} demo={d.rec!.isDemo && e.basis === "measured"} />
                      <span className="text-faint">{e.source}</span>
                      <span className="ml-auto text-faint">{e.at ? fmtDate(e.at) : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recently discovered" action={<ButtonLink size="sm" variant="ghost" href="/discover?sort=newest">All</ButtonLink>} />
          <CardBody className="space-y-2.5">
            {d.recent.length === 0 && <p className="text-xs text-muted">Nothing yet.</p>}
            {d.recent.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Link href={`/products/${p.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{p.name}</Link>
                {p.isDemo && <DemoBadge />}
                <TrendBadge value={p.trendClass} />
                <span className={cn("w-8 text-right tabular-nums", scoreTone(p.scoreTotal))}>{p.scoreTotal === null ? "—" : Math.round(p.scoreTotal)}</span>
              </div>
            ))}
            {d.candidates.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">New discovery candidates</p>
                {d.candidates.map((c) => <p key={c.id} className="text-xs text-muted">{c.query} <span className="text-faint">· {relTime(c.lastSeenAt)}</span></p>)}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent research reports" action={<ButtonLink size="sm" variant="ghost" href="/reports">All</ButtonLink>} />
          <CardBody className="space-y-2">
            {d.reports.length === 0 && <p className="text-xs text-muted">No reports yet.</p>}
            {d.reports.map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`} className="block text-sm hover:text-accent">
                {r.title}
                <span className="block text-[11px] text-faint">{r.model ? "AI" : "deterministic"} · {relTime(r.createdAt)}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Important trend changes" />
            <CardBody className="space-y-2">
              {d.changes.length === 0 && <p className="text-xs text-muted">None detected yet.</p>}
              {d.changes.map((c) => <div key={c.id} className="text-xs"><p className="font-medium">{c.productId ? <Link href={`/products/${c.productId}`} className="hover:text-accent">{c.title}</Link> : c.title}</p><p className="text-muted">{c.message}</p></div>)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Unread alerts" action={<ButtonLink size="sm" variant="ghost" href="/watchlist?tab=alerts">All</ButtonLink>} />
            <CardBody className="space-y-2">
              {d.alerts.length === 0 && <p className="text-xs text-muted">No unread alerts.</p>}
              {d.alerts.map((a) => <div key={a.id} className="flex items-start gap-2 text-xs"><Badge tone={a.severity === "warning" ? "warn" : a.severity === "critical" ? "bad" : "info"}>{a.kind.replace(/_/g, " ")}</Badge><span className="text-muted">{a.title}</span></div>)}
            </CardBody>
          </Card>
        </div>
      </div>
      <p className="mt-6 text-[11px] text-faint">Legend: <RecommendationBadge value="strong_candidate" /> <RecommendationBadge value="worth_investigating" /> <RecommendationBadge value="insufficient_evidence" /> — recommendations follow fixed rules in the scoring engine.</p>
    </>
  );
}
