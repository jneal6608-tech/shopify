import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { priorityPlan, testingBoard } from "@/lib/services/testing";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, scoreTone } from "@/components/ui/domain";
import { STAGE_LABELS, TESTING_STAGES, type Stage } from "@/lib/validation/common";
import { cn, fmtMoney, fmtNum } from "@/lib/utils";

export const metadata = { title: "Testing Workspace" };

const ACTION_TONE = { continue: "info", start: "good", wait: "neutral", stop: "bad" } as const;

export default async function TestingPage() {
  const user = await requireUser();
  const { board, plan } = await withUser(user.id, async (db) => ({ board: await testingBoard(db), plan: await priorityPlan(db) }));
  const stages: Stage[] = [...TESTING_STAGES, "discontinued"];
  return (
    <>
      <PageHeader title="Testing Workspace" description="Every product you test gets its own workspace. Move products through stages, record real results and let the evidence — not views alone — decide." />
      <Card className="mb-6">
        <CardHeader title="Recommended testing priorities" description="Deterministic plan from your budget, weekly hours, opportunity/confidence scores and current test verdicts" action={<ButtonLink href="/settings#preferences" size="sm" variant="ghost">Set budget & hours</ButtonLink>} />
        <CardBody className="space-y-3">
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{plan.plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          {plan.plan.ranked.length === 0 ? <p className="text-xs text-muted">No candidates yet — products appear here once they are in a testing stage or scored “worth investigating” or better.</p> : (
            <Table>
              <thead><tr><Th>Product</Th><Th>Stage</Th><Th className="text-right">Opportunity</Th><Th className="text-right">Confidence</Th><Th className="text-right">Sample cost</Th><Th>Test verdict</Th><Th>Action</Th><Th>Why</Th></tr></thead>
              <tbody>
                {plan.plan.ranked.map((r) => (
                  <tr key={r.productId}>
                    <Td><Link href={`/testing/${r.productId}`} className="font-medium hover:text-accent">{r.name}</Link></Td>
                    <Td className="text-xs text-muted">{STAGE_LABELS[r.stage as Stage]}</Td>
                    <Td className={cn("text-right tabular-nums", scoreTone(r.opportunity))}>{r.opportunity === null ? "—" : Math.round(r.opportunity)}</Td>
                    <Td className="text-right tabular-nums text-muted">{r.confidence === null ? "—" : Math.round(r.confidence)}</Td>
                    <Td className="text-right tabular-nums">{fmtMoney(r.sampleCost)}</Td>
                    <Td className="text-xs text-muted">{r.verdict?.replace(/_/g, " ") ?? "—"}</Td>
                    <Td><Badge tone={ACTION_TONE[r.action]}>{r.action}</Badge></Td>
                    <Td className="text-xs text-muted">{r.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      {board.length === 0 ? (
        <Empty title="No products in testing" action={<ButtonLink href="/discover" variant="primary">Find a product</ButtonLink>}>Set a product's stage to “Selected for testing” to create its workspace.</Empty>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {stages.map((s) => {
            const items = board.filter((b) => b.stage === s);
            return (
              <div key={s} className="w-64 shrink-0">
                <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted">{STAGE_LABELS[s]}<span className="text-faint">{items.length}</span></p>
                <div className="space-y-2">
                  {items.map((b) => (
                    <Link key={b.productId} href={`/testing/${b.productId}`} className="block rounded-lg border border-border bg-panel p-3 hover:border-accent/50">
                      <p className="text-sm font-medium">{b.name} {b.isDemo && <DemoBadge />}</p>
                      <p className="mt-1 text-[11px] text-faint">{b.videos} videos · {fmtNum(b.views)} views · {b.orders} orders · {fmtMoney(b.revenue)}</p>
                      <p className="mt-1 text-[11px] text-faint">Score <span className={scoreTone(b.scoreTotal)}>{b.scoreTotal === null ? "—" : Math.round(b.scoreTotal)}</span>{b.budgetUsd !== null && ` · budget ${fmtMoney(b.budgetUsd)}`}</p>
                    </Link>
                  ))}
                  {items.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-faint">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-6"><Notice>Stages: Discovered → Researching → Selected for testing → Sample ordered → Sample received → Content production → Testing → Promising → Scaling consideration (or Discontinued / Archived). Change stages from any product page; every change is logged with its reason.</Notice></div>
    </>
  );
}
