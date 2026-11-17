import Link from "next/link";
import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { marketPosition } from "@/lib/analytics/market";
import { Badge, Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { AddRecordButton } from "@/components/ui/add-record";
import { ActionButton } from "@/components/ui/action";
import { AiButton } from "@/components/ui/ai-button";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/utils";
import { median } from "@/lib/analytics/math";

export async function CompetitorsTab({ userId, product: p }: { userId: string; product: ProductOverview }) {
  const { competitors, report } = await withUser(userId, async (db) => ({
    competitors: await db<Array<Record<string, unknown> & { id: string; name: string; url: string | null; channel: string; price: number | null; currency: string; reviewCount: number | null; avgRating: number | null; adActivity: string; marketingAngles: string[]; complaints: string[]; positioning: string; observedAt: Date; isDemo: boolean }>>`
      select * from public.competitors where product_id = ${p.id} order by observed_at desc`,
    report: (await db<{ id: string; model: string; output: Record<string, unknown>; createdAt: Date }[]>`
      select id, model, output, created_at from public.research_reports where product_id = ${p.id} and kind = 'competitor_analysis' order by created_at desc limit 1`)[0],
  }));
  const pos = marketPosition(p.competitionScore, p.trendClass);
  const prices = competitors.map((c) => c.price).filter((x): x is number => x !== null);
  const complaints = new Map<string, number>();
  for (const c of competitors) for (const x of c.complaints) complaints.set(x.toLowerCase(), (complaints.get(x.toLowerCase()) ?? 0) + 1);
  const topComplaints = [...complaints.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader
            title={`Competitors (${competitors.length})`}
            description="Publicly visible information you recorded. Sales and profitability of competitors are never assumed."
            action={<AddRecordButton preset="competitor" endpoint={`/api/products/${p.id}/competitors`} title="Add competitor" label="Add competitor" />}
          />
          {competitors.length === 0 ? (
            <CardBody><p className="text-xs text-muted">No competitors recorded. Search the product on Google Shopping, Amazon, TikTok Shop and the Meta Ad Library, then add the stores you find.</p></CardBody>
          ) : (
            <Table>
              <thead><tr><Th>Competitor</Th><Th className="text-right">Price</Th><Th className="text-right">Reviews</Th><Th>Ads</Th><Th>Angles / complaints</Th><Th>Observed</Th><Th /></tr></thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <div className="font-medium">{c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{c.name}</a> : c.name} {c.isDemo && <DemoBadge />}</div>
                      <div className="text-[11px] text-faint">{c.channel.replace(/_/g, " ")}{c.positioning && ` · ${c.positioning.slice(0, 80)}`}</div>
                    </Td>
                    <Td className="text-right tabular-nums">{fmtMoney(c.price, c.currency)}</Td>
                    <Td className="text-right tabular-nums">{fmtNum(c.reviewCount)}{c.avgRating !== null && <span className="text-faint"> · {c.avgRating}★</span>}</Td>
                    <Td><Badge tone={c.adActivity === "heavy" ? "bad" : c.adActivity === "some" ? "warn" : "neutral"}>{c.adActivity.replace("_", " ")}</Badge></Td>
                    <Td className="max-w-64 text-[11px] text-muted">{c.marketingAngles.slice(0, 2).join("; ")}{c.complaints.length > 0 && <span className="text-bad/80"> · {c.complaints.slice(0, 2).join("; ")}</span>}</Td>
                    <Td className="whitespace-nowrap text-xs text-faint">{fmtDate(c.observedAt)}</Td>
                    <Td className="whitespace-nowrap">
                      <AddRecordButton preset="competitor" endpoint={`/api/competitors/${c.id}`} method="PATCH" initial={c} title="Edit competitor" label="Edit" variant="ghost" />
                      <ActionButton size="sm" variant="ghost" endpoint={`/api/competitors/${c.id}`} method="DELETE" confirm="Delete this competitor?">×</ActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader
            title="AI competitor & differentiation analysis"
            description={report ? `${report.model} · ${fmtDate(report.createdAt, true)}` : "Positioning, angles, complaints and differentiation ideas from your records"}
            action={<AiButton size="sm" variant="secondary" endpoint={`/api/products/${p.id}/ai/competitors`} disabled={competitors.length === 0}>{report ? "Regenerate" : "Analyse"}</AiButton>}
          />
          <CardBody>{report ? <Link href={`/reports/${report.id}`} className="text-sm text-accent hover:underline">Open the full competitor report →</Link> : <p className="text-xs text-muted">Add competitors first. AI output is labelled as interpretation.</p>}</CardBody>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Market position" description="Derived from the competition component score" />
          <CardBody className="space-y-2 text-sm">
            <Badge tone={pos.tone}>{pos.label}</Badge>
            <p className="text-xs text-muted">{pos.explanation}</p>
            {p.competitionScore === null && <Notice tone="warn">No competition indicators yet — this is not evidence of an empty market.</Notice>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pricing landscape" />
          <CardBody className="space-y-1 text-sm">
            <Row k="Competitor prices recorded" v={String(prices.length)} />
            <Row k="Lowest" v={fmtMoney(prices.length ? Math.min(...prices) : null)} />
            <Row k="Median" v={fmtMoney(median(prices))} />
            <Row k="Highest" v={fmtMoney(prices.length ? Math.max(...prices) : null)} />
            <Row k="Your planned price" v={fmtMoney(p.estSellingPrice)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recurring complaints" description="Differentiation opportunities" />
          <CardBody>
            {topComplaints.length === 0 ? <p className="text-xs text-muted">None recorded.</p> : (
              <ul className="space-y-1 text-xs">{topComplaints.map(([c, n]) => <li key={c} className="flex justify-between gap-2"><span className="text-muted">{c}</span><span className="text-faint">×{n}</span></li>)}</ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted">{k}</span><span className="tabular-nums">{v}</span></div>;
}
