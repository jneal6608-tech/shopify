import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { latestScore } from "@/lib/services/scoring";
import { computeUnitEconomics, DEFAULT_PROFIT_INPUT } from "@/lib/analytics/profit";
import { CONFIDENCE_WEIGHTS, MISSING_COMPONENT_SCORE, RECOMMENDATION_LABELS, type Recommendation } from "@/lib/analytics/scoring";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/primitives";
import { Provenance, ScoreBar } from "@/components/ui/domain";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/utils";
import { AiEvaluation } from "./ai-evaluation";

export async function OverviewTab({ userId, product: p }: { userId: string; product: ProductOverview }) {
  const { score, report, prefs } = await withUser(userId, async (db) => ({
    score: await latestScore(db, p.id),
    report: (await db<{ id: string; model: string | null; output: unknown; createdAt: Date }[]>`
      select id, model, output, created_at from public.research_reports where product_id = ${p.id} and kind = 'product_evaluation' order by created_at desc limit 1`)[0] ?? null,
    prefs: (await db<{ feeSettings: Record<string, number> }[]>`select fee_settings from public.user_preferences`)[0],
  }));
  const econ =
    p.estSellingPrice !== null && p.estSupplierCost !== null
      ? computeUnitEconomics({ ...DEFAULT_PROFIT_INPUT, ...(prefs?.feeSettings ?? {}), sellingPrice: p.estSellingPrice, supplierCost: p.estSupplierCost, shippingCost: p.estShippingCost ?? 0 })
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader
            title="Opportunity score breakdown"
            description={score ? `Formula ${score.formulaVersion} · computed ${fmtDate(score.computedAt, true)} · missing components count as ${MISSING_COMPONENT_SCORE}/100` : "Not scored yet"}
          />
          <CardBody className="space-y-4">
            {p.isDemo && <Notice tone="demo" title="Demo product">This product and its observations are synthetic demo data. The score illustrates the formulas only — it is not market intelligence.</Notice>}
            {!score ? (
              <p className="text-sm text-muted">Click “Rescore” to compute the score.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-bg/50 p-3 text-sm">
                  <p className="font-medium">{RECOMMENDATION_LABELS[score.recommendation as Recommendation]}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{score.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div className="space-y-3">
                  {score.components.map((c) => (
                    <details key={c.key} className="group rounded-lg border border-border/70 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-3">
                        <span className="w-48 shrink-0 text-xs font-medium">{c.label}</span>
                        <span className="hidden w-28 shrink-0 sm:block"><Provenance kind={c.basis} demo={p.isDemo && c.basis !== "none" && c.basis.startsWith("measured")} /></span>
                        <span className="flex-1"><ScoreBar value={c.score} weight={c.weight} /></span>
                      </summary>
                      <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted">
                        <ul className="list-disc space-y-0.5 pl-5">{c.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
                        <p className="mt-1 text-faint">
                          Reliability {c.reliability === null ? "—" : c.reliability} · latest input {fmtDate(c.latestAt)} · contributes {((c.effectiveScore * c.weight) / 100).toFixed(1)} points
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
                {score.missing.length > 0 && (
                  <Notice tone="warn" title="Missing information (penalised, lowers confidence)">
                    <ul className="list-disc pl-5">{score.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                  </Notice>
                )}
              </>
            )}
          </CardBody>
        </Card>
        <AiEvaluation productId={p.id} report={report} />
      </div>

      <div className="space-y-5">
        {score && (
          <Card>
            <CardHeader title={`Confidence ${Math.round(score.confidence)}/100`} description="How much to trust the opportunity score" />
            <CardBody className="space-y-2 text-xs">
              {(Object.keys(CONFIDENCE_WEIGHTS) as Array<keyof typeof CONFIDENCE_WEIGHTS>).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-28 capitalize text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="flex-1"><ScoreBar value={Math.round(score.confidenceBreakdown[k] * 100)} weight={Math.round(CONFIDENCE_WEIGHTS[k] * 100)} /></span>
                </div>
              ))}
              <p className="pt-1 text-faint">Completeness = share of scoring weight with data · reliability = source quality · freshness = age of newest inputs · agreement = independent demand signals pointing the same way · sample size = trend data points.</p>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Product details" />
          <CardBody className="space-y-3 text-sm">
            <Detail label="Description">{p.description || <Missing />}</Detail>
            <Detail label="Problem being solved">{p.problemSolved || <Missing />}</Detail>
            <Detail label="Potential customer">{p.targetCustomer || <Missing />}</Detail>
            <Detail label="Keywords">{p.keywords.length ? p.keywords.join(", ") : <Missing />}</Detail>
            <Detail label="Weight / fragile">{p.weightGrams ? `${p.weightGrams} g` : "weight unknown"} · {p.isFragile === null ? "fragility unknown" : p.isFragile ? "fragile" : "not fragile"}</Detail>
            <Detail label="Discovery source">{p.discoverySource}</Detail>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Estimated unit economics" description="Your estimates · default fees · before marketing" />
          <CardBody className="space-y-1.5 text-sm">
            <Row k="Supplier cost (est.)" v={fmtMoney(p.estSupplierCost)} />
            <Row k="Shipping (est.)" v={fmtMoney(p.estShippingCost)} />
            <Row k="Selling price (est.)" v={fmtMoney(p.estSellingPrice)} />
            {econ ? (
              <>
                <Row k="Fees + refunds + other" v={fmtMoney(econ.totalVariableCosts - econ.costOfGoods)} />
                <Row k="Contribution / sale" v={fmtMoney(econ.contributionBeforeMarketing)} strong />
                <Row k="Contribution margin" v={fmtPct(econ.contributionMarginPct)} />
                <Row k="Break-even CAC" v={fmtMoney(econ.breakEvenCac)} />
                {econ.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
              </>
            ) : (
              <p className="text-xs text-muted">Add supplier cost and selling price to estimate contribution.</p>
            )}
            <a href={`/calculator?price=${p.estSellingPrice ?? ""}&cost=${p.estSupplierCost ?? ""}&shipping=${p.estShippingCost ?? ""}`} className="block pt-1 text-xs text-accent hover:underline">Open in profit calculator →</a>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-muted">{children}</div>
    </div>
  );
}
function Missing() {
  return <span className="text-faint italic">Not recorded</span>;
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{v}</span>
    </div>
  );
}
