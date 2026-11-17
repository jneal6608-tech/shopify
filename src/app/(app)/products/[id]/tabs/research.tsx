import Link from "next/link";
import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { stageHistory } from "@/lib/services/products";
import { scoreHistory } from "@/lib/services/scoring";
import { describeWeightChange, type ScoringWeights } from "@/lib/analytics/weights";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/analytics/scoring";
import { Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { TimeSeriesChart } from "@/components/charts/line-chart";
import { STAGE_LABELS, type Stage } from "@/lib/validation/common";
import { fmtDate } from "@/lib/utils";
import { DecisionForm } from "./decision-form";

export async function ResearchTab({ userId, product: p }: { userId: string; product: ProductOverview }) {
  const { scores, stages, reports, decisions } = await withUser(userId, async (db) => ({
    scores: await scoreHistory(db, p.id),
    stages: await stageHistory(db, p.id),
    reports: await db<{ id: string; kind: string; title: string; model: string | null; createdAt: Date }[]>`
      select id, kind, title, model, created_at from public.research_reports where product_id = ${p.id} order by created_at desc limit 50`,
    decisions: await db<{ id: string; decision: string; reasons: string[]; notes: string; outcome: string | null; actualMarginPct: number | null; scoreAtDecision: number | null; createdAt: Date }[]>`
      select * from public.product_decisions where product_id = ${p.id} order by created_at desc`,
  }));
  const chrono = [...scores].reverse();
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader title="Score history" description="A new snapshot is stored when inputs, weights or the formula change (or weekly). Changes caused by weight edits are called out." />
          <CardBody>
            {chrono.length >= 2 ? (
              <TimeSeriesChart
                height={200}
                yDomain={[0, 100]}
                series={[
                  { key: "total", name: "Opportunity", points: chrono.map((s) => ({ date: s.computedAt.toISOString(), value: s.total })) },
                  { key: "conf", name: "Confidence", points: chrono.map((s) => ({ date: s.computedAt.toISOString(), value: s.confidence })) },
                ]}
              />
            ) : (
              <p className="text-xs text-muted">A chart appears after two snapshots.</p>
            )}
          </CardBody>
          <Table>
            <thead><tr><Th>Computed</Th><Th className="text-right">Score</Th><Th className="text-right">Conf.</Th><Th>Recommendation</Th><Th>What changed</Th></tr></thead>
            <tbody>
              {scores.map((s, i) => {
                const prev = scores[i + 1];
                const weightChanges = prev ? describeWeightChange(prev.weights as ScoringWeights, s.weights as ScoringWeights) : [];
                return (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(s.computedAt, true)}</Td>
                    <Td className="text-right tabular-nums">{s.total}</Td>
                    <Td className="text-right tabular-nums text-muted">{s.confidence}</Td>
                    <Td className="text-xs">{RECOMMENDATION_LABELS[s.recommendation as Recommendation]}</Td>
                    <Td className="text-xs text-muted">
                      {!prev ? "First score" : weightChanges.length ? <><Badge tone="warn">Weights changed</Badge> {weightChanges.join("; ")}</> : prev.formulaVersion !== s.formulaVersion ? `Formula ${prev.formulaVersion} → ${s.formulaVersion}` : prev.inputsDigest !== s.inputsDigest ? "New or changed evidence" : "Periodic refresh (data aged)"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Research reports" />
          {reports.length === 0 ? <CardBody><p className="text-xs text-muted">No reports yet.</p></CardBody> : (
            <Table>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <Td><Link className="text-accent hover:underline" href={`/reports/${r.id}`}>{r.title}</Link></Td>
                    <Td className="text-xs text-muted">{r.kind.replace(/_/g, " ")}</Td>
                    <Td className="text-xs text-faint">{r.model ?? "deterministic"}</Td>
                    <Td className="whitespace-nowrap text-xs text-faint">{fmtDate(r.createdAt, true)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        <DecisionForm productId={p.id} />
        <Card>
          <CardHeader title="Decisions & outcomes" description="Feeds the learning loop (Reports → Insights)" />
          <CardBody className="space-y-3 text-xs">
            {decisions.length === 0 && <p className="text-muted">No decisions recorded.</p>}
            {decisions.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-2">
                <div className="flex items-center gap-2"><Badge tone="accent">{d.decision}</Badge>{d.outcome && <Badge tone={d.outcome === "performed_well" ? "good" : d.outcome === "performed_poorly" ? "bad" : "neutral"}>{d.outcome.replace("_", " ")}</Badge>}<span className="ml-auto text-faint">{fmtDate(d.createdAt)}</span></div>
                {d.reasons.length > 0 && <p className="mt-1 text-muted">{d.reasons.join(" · ")}</p>}
                {d.notes && <p className="mt-1 text-faint">{d.notes}</p>}
                <p className="mt-1 text-faint">Score at decision: {d.scoreAtDecision ?? "—"}{d.actualMarginPct !== null && ` · actual margin ${d.actualMarginPct}%`}</p>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Stage history" />
          <CardBody className="space-y-1.5 text-xs">
            {stages.map((s, i) => (
              <p key={i} className="text-muted"><span className="text-faint">{fmtDate(s.createdAt, true)}</span> · {s.fromStage ? `${STAGE_LABELS[s.fromStage as Stage]} → ` : ""}<span className="text-fg">{STAGE_LABELS[s.toStage as Stage]}</span>{s.reason && <> — {s.reason}</>}</p>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
