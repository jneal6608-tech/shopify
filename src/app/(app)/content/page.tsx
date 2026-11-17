import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { FACELESS_FORMATS } from "@/lib/analytics/rubrics";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, scoreTone } from "@/components/ui/domain";
import { cn, fmtDate, fmtNum, fmtPct } from "@/lib/utils";

export const metadata = { title: "Content Intelligence" };
const label = (k: string) => FACELESS_FORMATS.find((f) => f.key === k)?.label ?? (k || "unspecified");

export default async function ContentPage() {
  const user = await requireUser();
  const d = await withUser(user.id, async (db) => ({
    products: await db<Array<{ id: string; name: string; isDemo: boolean; contentScore: number | null; packs: number; refs: number; lastPack: Date | null; assessedBy: string | null }>>`
      select p.id, p.name, p.is_demo, p.content_score,
        (select count(*)::int from public.content_packs c where c.product_id = p.id) as packs,
        (select count(*)::int from public.reference_videos r where r.product_id = p.id) as refs,
        (select max(created_at) from public.content_packs c where c.product_id = p.id) as last_pack,
        (select assessed_by from public.product_assessments a where a.product_id = p.id and a.kind = 'content' order by created_at desc limit 1) as assessed_by
      from public.product_overview p where p.stage <> 'archived' order by p.content_score desc nulls last limit 100`,
    formats: await db<Array<{ format: string; videos: number; views: number; engagements: number; clicks: number; isDemo: boolean }>>`
      select v.format, count(*)::int as videos, coalesce(sum(l.views), 0)::bigint as views,
        coalesce(sum(l.likes + l.comments + l.shares + l.saves), 0)::bigint as engagements, coalesce(sum(l.link_clicks), 0)::bigint as clicks, bool_or(v.is_demo) as is_demo
      from public.published_videos v
      left join lateral (select * from public.video_performance p where p.video_id = v.id order by captured_at desc limit 1) l on true
      group by v.format order by sum(l.link_clicks) desc nulls last`,
    hooks: await db<Array<{ hook: string; productName: string; views: number; clicks: number; isDemo: boolean }>>`
      select v.hook, p.name as product_name, l.views, l.link_clicks as clicks, v.is_demo
      from public.published_videos v join public.products p on p.id = v.product_id
      join lateral (select * from public.video_performance x where x.video_id = v.id order by captured_at desc limit 1) l on true
      where v.hook <> '' and l.views >= 300 order by (l.link_clicks::numeric / nullif(l.views, 0)) desc nulls last limit 10`,
    campaigns: await db<Array<{ id: string; name: string; productId: string; productName: string; platform: string; format: string; status: string; videos: number }>>`
      select c.id, c.name, c.product_id, p.name as product_name, c.platform, c.format, c.status,
        (select count(*)::int from public.published_videos v where v.campaign_id = c.id) as videos
      from public.content_campaigns c join public.products p on p.id = c.product_id order by c.created_at desc limit 50`,
  }));
  return (
    <>
      <PageHeader title="Content Intelligence" description="Faceless short-form content potential across your products, AI content packs, and what your own published videos have actually taught you." />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Faceless content potential by product" description="Open a product's Faceless content tab to rate formats, study reference videos and generate content packs" />
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">Content score</Th><Th>Rated by</Th><Th className="text-right">Reference videos</Th><Th className="text-right">Packs</Th><Th>Last pack</Th></tr></thead>
            <tbody>
              {d.products.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/products/${p.id}?tab=content`} className="font-medium hover:text-accent">{p.name}</Link> {p.isDemo && <DemoBadge />}</Td>
                  <Td className={cn("text-right tabular-nums", scoreTone(p.contentScore))}>{p.contentScore === null ? "—" : Math.round(p.contentScore)}</Td>
                  <Td>{p.assessedBy ? <Badge tone={p.assessedBy === "ai" ? "accent" : "info"}>{p.assessedBy === "ai" ? "AI estimate" : "You"}</Badge> : <span className="text-xs text-faint">not rated</span>}</Td>
                  <Td className="text-right">{p.refs}</Td>
                  <Td className="text-right">{p.packs}</Td>
                  <Td className="text-xs text-faint">{fmtDate(p.lastPack)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="What works for you" description="From your published videos (latest snapshots)" />
            <CardBody className="space-y-3 text-xs">
              {d.formats.length === 0 ? <p className="text-muted">No published videos yet. Record videos and metrics in the Testing Workspace to learn which formats convert.</p> : (
                <table className="w-full">
                  <thead><tr className="text-faint"><th className="text-left">Format</th><th className="text-right">Videos</th><th className="text-right">Eng.</th><th className="text-right">CTR</th></tr></thead>
                  <tbody>{d.formats.map((f) => <tr key={f.format} className="border-t border-border/50"><td className="py-1">{label(f.format)} {f.isDemo && <DemoBadge />}</td><td className="text-right">{f.videos}</td><td className="text-right tabular-nums">{fmtPct(f.views ? (f.engagements / f.views) * 100 : null, 1)}</td><td className="text-right tabular-nums">{fmtPct(f.views ? (f.clicks / f.views) * 100 : null, 2)}</td></tr>)}</tbody>
                </table>
              )}
              <p className="text-faint">Attention (engagement) and intent (link-click CTR) are shown separately; rank formats by CTR when choosing what to test next.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Top hooks by click-through" description="Videos with ≥300 views" />
            <CardBody className="space-y-2 text-xs">
              {d.hooks.length === 0 && <p className="text-muted">Not enough data yet.</p>}
              {d.hooks.map((h, i) => <div key={i}><p className="text-fg">“{h.hook}” {h.isDemo && <DemoBadge />}</p><p className="text-faint">{h.productName} · {fmtNum(h.views)} views · {fmtNum(h.clicks)} clicks ({fmtPct(h.views ? (h.clicks / h.views) * 100 : null, 2)})</p></div>)}
            </CardBody>
          </Card>
        </div>
      </div>
      <Card className="mt-5">
        <CardHeader title="Content campaigns" />
        {d.campaigns.length === 0 ? <CardBody><p className="text-xs text-muted">Create campaigns from a product's testing workspace.</p></CardBody> : (
          <Table>
            <thead><tr><Th>Campaign</Th><Th>Product</Th><Th>Platform</Th><Th>Format</Th><Th>Status</Th><Th className="text-right">Videos</Th></tr></thead>
            <tbody>{d.campaigns.map((c) => <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td><Link className="hover:text-accent" href={`/testing/${c.productId}`}>{c.productName}</Link></Td><Td>{c.platform}</Td><Td className="text-xs">{label(c.format)}</Td><Td><Badge>{c.status}</Badge></Td><Td className="text-right">{c.videos}</Td></tr>)}</tbody>
          </Table>
        )}
      </Card>
      <div className="mt-5"><Notice>Faceless formats evaluated: {FACELESS_FORMATS.map((f) => f.label).join(" · ")}.</Notice></div>
    </>
  );
}
