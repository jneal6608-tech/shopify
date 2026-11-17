import { Badge, Card, CardBody, CardHeader, Notice } from "@/components/ui/primitives";
import { AiButton } from "@/components/ui/ai-button";
import type { Evaluation } from "@/lib/ai/schemas";
import { fmtDate } from "@/lib/utils";

const basisTone = { measured: "good", manual: "info", estimate: "warn", ai_interpretation: "accent", demo: "demo" } as const;

export function AiEvaluation({ productId, report }: { productId: string; report: { id: string; model: string | null; output: unknown; createdAt: Date } | null }) {
  const r = report?.output as Evaluation | undefined;
  return (
    <Card>
      <CardHeader
        title="AI research report"
        description={report ? `${report.model} · ${fmtDate(report.createdAt, true)} · explains the computed score; cannot change it` : "Claude explains the deterministic score using only the recorded evidence"}
        action={<AiButton size="sm" variant="secondary" endpoint={`/api/products/${productId}/ai/evaluation`}>{report ? "Regenerate" : "Generate report"}</AiButton>}
      />
      {r ? (
        <CardBody className="space-y-4 text-sm">
          <Notice tone="info">AI interpretation. Facts come only from the records on this page; check the evidence list before acting.</Notice>
          <p className="text-fg">{r.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <List title="Strengths" items={r.strengths} />
            <List title="Weaknesses" items={r.weaknesses} />
            <List title="Risks" items={r.risks} />
            <List title="Competitive concerns" items={r.competitiveConcerns} />
          </div>
          <Section title="Why this recommendation">{r.recommendationRationale}</Section>
          <Section title="Faceless short-form fit">{r.facelessMarketingView}</Section>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">Supporting evidence</p>
            <ul className="space-y-1.5">
              {r.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <Badge tone={basisTone[e.basis]}>{e.basis.replace("_", " ")}</Badge>
                  <span className="text-muted">{e.claim} <span className="text-faint">— {e.source}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <List title="Missing information" items={r.missingInformation} />
            <List title="Recommended next steps" items={r.nextSteps} ordered />
          </div>
        </CardBody>
      ) : (
        <CardBody><p className="text-xs text-muted">No AI report yet. Requires ANTHROPIC_API_KEY; uses the model chosen in Settings.</p></CardBody>
      )}
    </Card>
  );
}

function List({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  const L = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">{title}</p>
      {items.length === 0 ? <p className="text-xs text-faint">None noted</p> : <L className={`${ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5 text-xs text-muted`}>{items.map((x, i) => <li key={i}>{x}</li>)}</L>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">{title}</p>
      <p className="text-xs text-muted">{children}</p>
    </div>
  );
}
