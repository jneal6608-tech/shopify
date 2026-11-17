import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getProduct } from "@/lib/services/products";
import { validationFor } from "@/lib/services/testing";
import { HttpError } from "@/lib/api/errors";
import { uuid, STAGE_LABELS, STAGES, type Stage } from "@/lib/validation/common";
import { VERDICT_LABELS, EVIDENCE_THRESHOLDS } from "@/lib/analytics/validation";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { HBarChart } from "@/components/charts/bar-chart";
import { TimeSeriesChart } from "@/components/charts/line-chart";
import { AiButton } from "@/components/ui/ai-button";
import { ActionButton } from "@/components/ui/action";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/utils";
import { ProjectForm, StageStepper, AddCampaign, AddVideo, AddSnapshot, AddSales } from "./client";

export default async function TestingWorkspace({ params }: { params: Promise<{ productId: string }> }) {
  const user = await requireUser();
  const { productId } = await params;
  if (!uuid.safeParse(productId).success) notFound();
  const data = await withUser(user.id, async (db) => {
    try {
      const product = await getProduct(db, productId);
      const [project] = await db<{ budgetUsd: number | null; hoursPerWeek: number | null; hypothesis: string; successCriteria: string; sampleCost: number | null; startedAt: Date }[]>`
        select budget_usd, hours_per_week, hypothesis, success_criteria, sample_cost, started_at from public.testing_projects where product_id = ${productId}`;
      return {
        product,
        project: project ?? null,
        v: await validationFor(db, productId),
        campaigns: await db<{ id: string; name: string; platform: string; format: string; angle: string; status: string; shopifyUtmCampaign: string | null }[]>`select * from public.content_campaigns where product_id = ${productId} order by created_at desc`,
        snapshots: await db<{ videoId: string; capturedAt: Date; views: number }[]>`select vp.video_id, vp.captured_at, vp.views from public.video_performance vp join public.published_videos v on v.id = vp.video_id where v.product_id = ${productId} order by vp.captured_at`,
        sales: await db<{ id: number; periodStart: Date; periodEnd: Date; sessions: number | null; addToCarts: number | null; orders: number; revenue: number; refundCount: number; adSpend: number; source: string }[]>`select * from public.sales_performance where product_id = ${productId} order by period_start desc`,
        report: (await db<{ id: string; createdAt: Date; output: Record<string, unknown> }[]>`select id, created_at, output from public.research_reports where product_id = ${productId} and kind = 'validation_analysis' order by created_at desc limit 1`)[0],
      };
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  });
  if (!data) notFound();
  const { product: p, v, campaigns, snapshots, sales, report, project } = data;
  const r = v.result;
  const t = EVIDENCE_THRESHOLDS;
  const videoNames = new Map(v.videos.map((x, i) => [x.videoId, x.title || x.hook.slice(0, 30) || `Video ${i + 1}`]));
  const topVideos = [...v.videos].sort((a, b) => b.views - a.views).slice(0, 8);

  return (
    <>
      <PageHeader
        title={`Testing: ${p.name}`}
        description={<span className="flex flex-wrap items-center gap-2">{p.isDemo && <DemoBadge />}<Badge>{STAGE_LABELS[p.stage]}</Badge><Link href={`/products/${p.id}`} className="text-accent">Research page →</Link>{project && <span className="text-faint">Test started {fmtDate(project.startedAt)}</span>}</span>}
      />
      <StageStepper productId={p.id} current={p.stage} stages={STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s as Stage] }))} />

      <Card className="my-5">
        <CardHeader title="Validation verdict" description="Attention, intent and purchasing are evaluated separately. A product is never called a winner from views alone." action={<AiButton size="sm" variant="secondary" endpoint={`/api/products/${p.id}/validation`}>AI analysis</AiButton>} />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.verdict === "converting" ? "good" : r.verdict === "insufficient_evidence" ? "warn" : r.verdict === "weak_attention" ? "bad" : "info"}>{VERDICT_LABELS[r.verdict]}</Badge>
            <span className="text-xs text-muted">Next action: <span className="font-medium text-fg">{r.nextAction.replace(/_/g, " ")}</span></span>
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {r.missingData.length > 0 && <Notice tone="warn" title="Missing data">{r.missingData.join(" · ")}</Notice>}
          {report && <p className="text-xs"><Link className="text-accent" href={`/reports/${report.id}`}>Latest AI validation analysis ({fmtDate(report.createdAt, true)}) →</Link></p>}
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attention · views" value={fmtNum(r.attention.totalViews)} sub={`${r.attention.videos} videos · engagement ${fmtPct(r.attention.avgEngagementRate === null ? null : r.attention.avgEngagementRate * 100, 2)}${r.attention.sufficient ? "" : ` · need ${fmtNum(t.minViewsForAttention)}+ views`}`} />
        <Stat label="Intent · link clicks" value={fmtNum(r.intent.totalClicks)} sub={`CTR ${fmtPct(r.intent.clickThroughRate === null ? null : r.intent.clickThroughRate * 100, 3)} · ${fmtNum(r.intent.totalProfileVisits)} profile visits`} />
        <Stat label="Store · sessions → carts" value={`${fmtNum(r.purchase.sessions)} → ${fmtNum(r.purchase.addToCarts)}`} sub={`ATC rate ${fmtPct(r.purchase.addToCartRate === null ? null : r.purchase.addToCartRate * 100, 1)}`} />
        <Stat label="Purchases · orders" value={fmtNum(r.purchase.orders)} tone={r.purchase.orders >= t.minOrdersForPurchase ? "good" : undefined} sub={`${fmtMoney(r.purchase.revenue)} · CVR ${fmtPct(r.purchase.conversionRate === null ? null : r.purchase.conversionRate * 100, 2)} · AOV ${fmtMoney(r.purchase.averageOrderValue)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title={`Published videos (${v.videos.length})`} description="Metrics are cumulative snapshots; add a new snapshot whenever you check the platform" action={<AddVideo productId={p.id} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />} />
            {v.videos.length === 0 ? <CardBody><p className="text-xs text-muted">No videos recorded yet.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Video</Th><Th className="text-right">Views</Th><Th className="text-right">Eng. rate</Th><Th className="text-right">Clicks</Th><Th className="text-right">CTR</Th><Th>Updated</Th><Th /></tr></thead>
                <tbody>
                  {v.videos.map((x) => {
                    const eng = x.views ? ((x.likes + x.comments + x.shares + x.saves) / x.views) * 100 : null;
                    const ctr = x.views ? (x.linkClicks / x.views) * 100 : null;
                    return (
                      <tr key={x.videoId}>
                        <Td><div className="font-medium">{x.url ? <a href={x.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{videoNames.get(x.videoId)}</a> : videoNames.get(x.videoId)} {x.isDemo && <DemoBadge />}</div><div className="text-[11px] text-faint">{x.platform} · {x.format || "format n/a"} · {fmtDate(x.publishedAt)}{x.hook && ` · “${x.hook.slice(0, 60)}”`}</div></Td>
                        <Td className="text-right tabular-nums">{fmtNum(x.views)}</Td>
                        <Td className="text-right tabular-nums">{fmtPct(eng, 2)}</Td>
                        <Td className="text-right tabular-nums">{fmtNum(x.linkClicks)}</Td>
                        <Td className="text-right tabular-nums">{fmtPct(ctr, 3)}</Td>
                        <Td className="whitespace-nowrap text-xs text-faint">{x.capturedAt ? fmtDate(x.capturedAt) : "no data"} ({x.snapshots})</Td>
                        <Td className="whitespace-nowrap"><AddSnapshot videoId={x.videoId} /><ActionButton size="sm" variant="ghost" endpoint={`/api/videos/${x.videoId}`} method="DELETE" confirm="Delete this video and its snapshots?">×</ActionButton></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          {topVideos.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2">
              <Card><CardHeader title="Views by video" /><CardBody><HBarChart data={topVideos.map((x) => ({ label: (videoNames.get(x.videoId) ?? "").slice(0, 24), value: x.views }))} valueLabel="views" /></CardBody></Card>
              <Card><CardHeader title="Link clicks by video" description="Purchase intent" /><CardBody><HBarChart data={[...v.videos].sort((a, b) => b.linkClicks - a.linkClicks).slice(0, 8).map((x) => ({ label: (videoNames.get(x.videoId) ?? "").slice(0, 24), value: x.linkClicks }))} valueLabel="clicks" /></CardBody></Card>
            </div>
          )}
          {snapshots.length >= 3 && (
            <Card>
              <CardHeader title="Cumulative views over time" description="Top 5 videos by views" />
              <CardBody>
                <TimeSeriesChart series={topVideos.slice(0, 5).map((x) => ({ key: x.videoId, name: (videoNames.get(x.videoId) ?? "").slice(0, 24), points: snapshots.filter((s) => s.videoId === x.videoId).map((s) => ({ date: s.capturedAt.toISOString(), value: s.views })) }))} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Content format performance" description={`Formats/hooks are only ranked once a video has ≥${t.minViewsPerVideoForRanking} views`} />
            <Table>
              <thead><tr><Th>Format</Th><Th className="text-right">Videos</Th><Th className="text-right">Views</Th><Th className="text-right">Engagement</Th><Th className="text-right">CTR</Th></tr></thead>
              <tbody>{r.formatPerformance.map((f) => <tr key={f.format}><Td>{f.format}</Td><Td className="text-right">{f.videos}</Td><Td className="text-right tabular-nums">{fmtNum(f.views)}</Td><Td className="text-right tabular-nums">{fmtPct(f.avgEngagementRate === null ? null : f.avgEngagementRate * 100, 2)}</Td><Td className="text-right tabular-nums">{fmtPct(f.clickThroughRate === null ? null : f.clickThroughRate * 100, 3)}</Td></tr>)}</tbody>
            </Table>
            {r.bestByClicks.length > 0 && <CardBody className="text-xs text-muted">Best hooks by click-through: {r.bestByClicks.map((b) => `“${b.hook || b.title}” (${fmtPct((b.clickThroughRate ?? 0) * 100, 3)})`).join(" · ")}</CardBody>}
          </Card>
          <Card>
            <CardHeader title="Store performance" description={`Sources: ${v.sales.sources.join(", ") || "none"}. Shopify-synced periods take precedence over overlapping manual entries.`} action={<AddSales productId={p.id} />} />
            {sales.length === 0 ? <CardBody><p className="text-xs text-muted">No sales periods. Enter sessions and add-to-carts from Shopify Analytics manually (the Admin API does not expose sessions); orders and revenue can sync from Shopify.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Period</Th><Th>Source</Th><Th className="text-right">Sessions</Th><Th className="text-right">Carts</Th><Th className="text-right">Orders</Th><Th className="text-right">Revenue</Th><Th className="text-right">Refunds</Th><Th className="text-right">Ad spend</Th><Th /></tr></thead>
                <tbody>{sales.map((s) => <tr key={s.id}><Td className="whitespace-nowrap text-xs">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</Td><Td><Badge>{s.source}</Badge></Td><Td className="text-right tabular-nums">{fmtNum(s.sessions)}</Td><Td className="text-right tabular-nums">{fmtNum(s.addToCarts)}</Td><Td className="text-right tabular-nums">{s.orders}</Td><Td className="text-right tabular-nums">{fmtMoney(s.revenue)}</Td><Td className="text-right tabular-nums">{s.refundCount}</Td><Td className="text-right tabular-nums">{fmtMoney(s.adSpend)}</Td><Td>{s.source === "manual" && <ActionButton size="sm" variant="ghost" endpoint={`/api/sales/${s.id}`} method="DELETE">×</ActionButton>}</Td></tr>)}</tbody>
              </Table>
            )}
            <CardBody className="text-xs text-muted">Estimated contribution after refunds and ad spend: <span className="font-medium text-fg">{fmtMoney(r.purchase.contributionEstimate)}</span> (unit contribution {fmtMoney(v.unitContribution)} from your estimates).</CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          <ProjectForm productId={p.id} initial={project} />
          <Card>
            <CardHeader title="Content campaigns" action={<AddCampaign productId={p.id} />} />
            <CardBody className="space-y-2 text-xs">
              {campaigns.length === 0 && <p className="text-muted">No campaigns. Group videos by angle to compare them.</p>}
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2"><span className="font-medium">{c.name}</span><Badge>{c.platform}</Badge><Badge tone="accent">{c.status}</Badge><span className="ml-auto"><ActionButton size="sm" variant="ghost" endpoint={`/api/campaigns/${c.id}`} method="DELETE">×</ActionButton></span></div>
                  <p className="mt-1 text-faint">{c.format}{c.angle && ` · ${c.angle}`}{c.shopifyUtmCampaign && ` · utm_campaign=${c.shopifyUtmCampaign}`}</p>
                </div>
              ))}
            </CardBody>
          </Card>
          <Notice>Record your decision (continue, pause, discontinue, scale) with its outcome on the product's <Link className="text-accent" href={`/products/${p.id}?tab=research`}>Research history</Link> tab — it feeds the learning loop.</Notice>
        </div>
      </div>
    </>
  );
}
