import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getProductsByIds } from "@/lib/services/products";
import { latestScore, type StoredScore } from "@/lib/services/scoring";
import { computeUnitEconomics, DEFAULT_PROFIT_INPUT } from "@/lib/analytics/profit";
import { COMPONENT_KEYS, COMPONENT_LABELS } from "@/lib/analytics/weights";
import { Card, CardBody, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, RecommendationBadge, ScoreBar, TrendBadge } from "@/components/ui/domain";
import { AiButton } from "@/components/ui/ai-button";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/utils";
import { ComparePicker } from "./picker";

export const metadata = { title: "Product Comparison" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser();
  const ids = [...new Set(((await searchParams).ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 5);
  const d = await withUser(user.id, async (db) => {
    const products = await getProductsByIds(db, ids);
    const ordered = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
    const scores: Record<string, StoredScore | null> = {};
    for (const p of ordered) scores[p.id] = await latestScore(db, p.id);
    const all = await db<{ id: string; name: string }[]>`select id, name from public.products where stage <> 'archived' order by name limit 300`;
    const reports = await db<{ id: string; title: string; createdAt: Date; output: { strongestCandidateProductId: string; rationale: string }; inputSnapshot: { productIds: string[] } }[]>`
      select id, title, created_at, output, input_snapshot from public.research_reports where kind = 'comparison' order by created_at desc limit 20`;
    const prefs = (await db<{ feeSettings: Record<string, number> }[]>`select fee_settings from public.user_preferences`)[0];
    return { products: ordered, scores, all, reports, prefs };
  });
  const key = [...ids].sort().join(",");
  const report = d.reports.find((r) => [...(r.inputSnapshot.productIds ?? [])].sort().join(",") === key);
  const rows: Array<{ label: string; render: (p: (typeof d.products)[number]) => React.ReactNode }> = [
    { label: "Opportunity score", render: (p) => <ScoreBar value={p.scoreTotal} /> },
    { label: "Confidence", render: (p) => <ScoreBar value={p.scoreConfidence} /> },
    { label: "Recommendation", render: (p) => <RecommendationBadge value={p.recommendation} /> },
    { label: "Demand direction", render: (p) => <TrendBadge value={p.trendClass} /> },
    { label: "Search interest growth", render: (p) => fmtPct(p.growthPct, 0, true) },
    ...COMPONENT_KEYS.filter((k) => k !== "demand").map((k) => ({
      label: COMPONENT_LABELS[k],
      render: (p: (typeof d.products)[number]) => <ScoreBar value={d.scores[p.id]?.components.find((c) => c.key === k)?.score ?? null} />,
    })),
    { label: "Est. supplier cost", render: (p) => fmtMoney(p.estSupplierCost) },
    { label: "Selling price", render: (p) => fmtMoney(p.estSellingPrice) },
    {
      label: "Est. contribution / sale",
      render: (p) =>
        p.estSellingPrice !== null && p.estSupplierCost !== null
          ? fmtMoney(computeUnitEconomics({ ...DEFAULT_PROFIT_INPUT, ...(d.prefs?.feeSettings ?? {}), sellingPrice: p.estSellingPrice, supplierCost: p.estSupplierCost, shippingCost: p.estShippingCost ?? 0 }).contributionBeforeMarketing)
          : "—",
    },
    { label: "Key risks / missing data", render: (p) => <span className="text-[11px] text-muted">{d.scores[p.id]?.missing.join("; ") || "No missing components"}</span> },
  ];
  return (
    <>
      <PageHeader title="Product Comparison" description="Compare up to five products side by side. The AI report picks the strongest testing candidate for your business model — not simply the highest number." />
      <ComparePicker selected={d.products.map((p) => ({ id: p.id, name: p.name }))} all={d.all} />
      {d.products.length < 2 ? (
        <div className="mt-5"><Empty title="Select at least two products">Use the picker above, or tick products on the Discover page.</Empty></div>
      ) : (
        <>
          <Card className="mt-5">
            <Table>
              <thead><tr><Th className="w-48" />{d.products.map((p) => <Th key={p.id} className="min-w-44 normal-case"><Link href={`/products/${p.id}`} className="text-sm font-medium tracking-normal text-fg hover:text-accent">{p.name}</Link> {p.isDemo && <DemoBadge />}</Th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.label}><Td className="text-xs text-muted">{r.label}</Td>{d.products.map((p) => <Td key={p.id}>{r.render(p)}</Td>)}</tr>)}</tbody>
            </Table>
          </Card>
          <Card className="mt-5">
            <CardHeader title="AI comparative report" description={report ? `${fmtDate(report.createdAt, true)}` : "Weighs confidence, content fit, competition trajectory, economics and missing data"} action={<AiButton size="sm" endpoint="/api/compare/report" body={{ productIds: d.products.map((p) => p.id) }}>{report ? "Regenerate" : "Generate report"}</AiButton>} />
            <CardBody>
              {report ? (
                <div className="space-y-2 text-sm">
                  <Notice tone="info">AI interpretation of the recorded data.</Notice>
                  <p><span className="text-muted">Strongest candidate:</span> <span className="font-semibold">{d.products.find((p) => p.id === report.output.strongestCandidateProductId)?.name ?? "None — insufficient evidence"}</span></p>
                  <p className="text-xs text-muted">{report.output.rationale}</p>
                  <Link href={`/reports/${report.id}`} className="text-xs text-accent">Full report →</Link>
                </div>
              ) : <p className="text-xs text-muted">No report for this exact set yet.</p>}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
