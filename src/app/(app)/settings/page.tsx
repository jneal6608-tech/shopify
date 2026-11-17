import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { authMode, env } from "@/lib/env";
import { aiConfigured } from "@/lib/ai/client";
import { FEATURE_COST_ESTIMATES, SELECTABLE_MODELS } from "@/lib/ai/models";
import { sourceStatuses } from "@/lib/sources/registry";
import { JOB_DESCRIPTIONS, type JobKind } from "@/lib/jobs/handlers";
import { COMPONENT_LABELS, type ScoringWeights } from "@/lib/analytics/weights";
import { DEFAULT_ALERT_THRESHOLDS } from "@/lib/analytics/alerts";
import { DEFAULT_PROFIT_INPUT } from "@/lib/analytics/profit";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/action";
import { fmtDate, fmtMoney, relTime } from "@/lib/utils";
import { AiSettings, JobToggle, PreferencesForm, WeightsEditor } from "./client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const d = await withUser(user.id, async (db) => ({
    prefs: (await db<Array<{ aiModel: string; aiMonthlyBudgetUsd: number | null; testingBudgetUsd: number | null; weeklyHours: number | null; targetMarginPct: number | null; maxSupplierCost: number | null; preferredCategoryIds: string[]; avoidedKeywords: string[]; alertThresholds: Record<string, number>; feeSettings: Record<string, number> }>>`select * from public.user_preferences`)[0],
    versions: await db<Array<{ id: string; version: number; weights: ScoringWeights; reason: string; source: string; isActive: boolean; createdAt: Date }>>`select * from public.scoring_weight_versions order by version desc`,
    usage: await db<Array<{ feature: string; model: string; calls: number; cost: number; tokens: number }>>`
      select feature, model, count(*)::int as calls, sum(cost_usd)::numeric as cost, sum(input_tokens + output_tokens)::bigint as tokens
      from public.ai_usage where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc' group by feature, model order by sum(cost_usd) desc`,
    jobs: await db<Array<{ id: string; kind: JobKind; frequency: string; enabled: boolean; nextRunAt: Date | null; lastRunAt: Date | null; consecutiveFailures: number; lastStatus: string | null; lastSummary: Record<string, unknown> | null; lastError: string | null }>>`
      select j.*, r.status as last_status, r.summary as last_summary, r.error as last_error from public.research_jobs j
      left join lateral (select status, summary, error from public.job_runs x where x.job_id = j.id order by started_at desc limit 1) r on true order by j.kind`,
    categories: await db<{ id: string; name: string }[]>`select id, name from public.categories order by name`,
    shopify: (await db<{ shopDomain: string; status: string; lastError: string | null; lastCheckedAt: Date | null }[]>`select shop_domain, status, last_error, last_checked_at from public.shopify_integrations limit 1`)[0],
    demo: (await db<{ n: number }[]>`select count(*)::int as n from public.products where is_demo`)[0].n,
  }));
  const e = env();
  const spent = d.usage.reduce((a, u) => a + Number(u.cost), 0);
  const active = d.versions.find((v) => v.isActive);
  const integrations = [
    { name: "Authentication", ok: authMode() !== "unconfigured", detail: authMode() === "local" ? "Local development auth (never use in production)" : authMode() === "supabase" ? "Supabase Auth" : "Not configured" },
    { name: "Database", ok: Boolean(e.DATABASE_URL), detail: e.DATABASE_URL ? "Connected (RLS enforced per request)" : "DATABASE_URL missing" },
    { name: "Credential encryption", ok: Boolean(e.ENCRYPTION_KEY), detail: e.ENCRYPTION_KEY ? "AES-256-GCM key present" : "ENCRYPTION_KEY missing — store connections disabled" },
    { name: "Scheduled jobs (cron)", ok: Boolean(e.CRON_SECRET), detail: e.CRON_SECRET ? "CRON_SECRET set — Vercel Cron calls /api/cron/run" : "CRON_SECRET missing — jobs only run manually" },
    { name: "Anthropic Claude API", ok: aiConfigured(), detail: aiConfigured() ? "ANTHROPIC_API_KEY set" : "Not configured — AI features disabled, everything else works" },
    ...sourceStatuses().map((s) => ({ name: s.name, ok: s.configured, detail: s.configured ? "Configured" : s.setupHelp })),
    { name: "Shopify", ok: d.shopify?.status === "connected", detail: d.shopify ? `${d.shopify.shopDomain} · ${d.shopify.status}${d.shopify.lastError ? ` — ${d.shopify.lastError}` : ""} · checked ${relTime(d.shopify.lastCheckedAt)}` : "Not connected (Store Builder → Connection)" },
  ];
  return (
    <>
      <PageHeader title="Settings" description="AI model and budget, scoring weights, business preferences, integrations, scheduled research and demo data." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card id="ai">
          <CardHeader title="AI model & budget" description={`Spent this month: ${fmtMoney(spent)}${d.prefs.aiMonthlyBudgetUsd !== null ? ` of ${fmtMoney(d.prefs.aiMonthlyBudgetUsd)} budget` : " (no budget cap)"}`} />
          <CardBody className="space-y-4">
            {!aiConfigured() && <Notice tone="warn">ANTHROPIC_API_KEY is not set. AI features show a clear “not configured” message; scoring, trends, calculator and testing all work without AI.</Notice>}
            <AiSettings model={d.prefs.aiModel} budget={d.prefs.aiMonthlyBudgetUsd} models={Object.entries(SELECTABLE_MODELS).map(([id, m]) => ({ id, ...m }))} />
            <Table>
              <thead><tr><Th>Feature</Th><Th className="text-right">Opus 5.5</Th><Th className="text-right">Sonnet 5.5</Th></tr></thead>
              <tbody>{FEATURE_COST_ESTIMATES.map((f) => <tr key={f.feature}><Td className="text-xs">{f.label}</Td><Td className="text-right text-xs tabular-nums">{f.opus}</Td><Td className="text-right text-xs tabular-nums">{f.sonnet}</Td></tr>)}</tbody>
            </Table>
            <p className="text-[11px] text-faint">Estimates per use; actual cost is metered from token usage below. Store assistant messages typically cost $0.10–0.25 on Opus.</p>
            {d.usage.length > 0 && (
              <Table>
                <thead><tr><Th>Feature (this month)</Th><Th>Model</Th><Th className="text-right">Calls</Th><Th className="text-right">Tokens</Th><Th className="text-right">Cost</Th></tr></thead>
                <tbody>{d.usage.map((u) => <tr key={u.feature + u.model}><Td className="text-xs">{u.feature}</Td><Td className="text-xs text-faint">{u.model}</Td><Td className="text-right">{u.calls}</Td><Td className="text-right tabular-nums">{Number(u.tokens).toLocaleString()}</Td><Td className="text-right tabular-nums">{fmtMoney(Number(u.cost))}</Td></tr>)}</tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card id="weights">
          <CardHeader title={`Scoring weights · version ${active?.version ?? 1}`} description="Changing weights creates a new version with your reason and rescores every product. The model is never changed silently." />
          <CardBody className="space-y-4">
            {active && <WeightsEditor initial={active.weights} labels={COMPONENT_LABELS} />}
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">Version history</p>
              <div className="space-y-1.5">
                {d.versions.map((v) => (
                  <div key={v.id} className="text-xs">
                    <span className="font-medium">v{v.version}</span> {v.isActive && <Badge tone="good">active</Badge>} <Badge>{v.source.replace("_", " ")}</Badge> <span className="text-faint">{fmtDate(v.createdAt, true)}</span>
                    <p className="text-muted">{v.reason}</p>
                    <p className="text-faint">{Object.entries(v.weights).map(([k, w]) => `${k} ${w}%`).join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card id="preferences">
          <CardHeader title="Business preferences, fees & alert defaults" />
          <CardBody>
            <PreferencesForm
              prefs={d.prefs}
              categories={d.categories}
              alertDefaults={{ ...DEFAULT_ALERT_THRESHOLDS, ...d.prefs.alertThresholds }}
              feeDefaults={{ paymentFeePct: DEFAULT_PROFIT_INPUT.paymentFeePct, paymentFixedFee: DEFAULT_PROFIT_INPUT.paymentFixedFee, shopifyTxnFeePct: DEFAULT_PROFIT_INPUT.shopifyTxnFeePct, refundRatePct: DEFAULT_PROFIT_INPUT.refundRatePct, otherVariablePerUnit: DEFAULT_PROFIT_INPUT.otherVariablePerUnit, fixedMonthlyCosts: DEFAULT_PROFIT_INPUT.fixedMonthlyCosts, ...d.prefs.feeSettings }}
            />
          </CardBody>
        </Card>

        <Card id="integrations">
          <CardHeader title="Integration status" description="Credentials live only in server environment variables or encrypted server-only tables" />
          <div className="divide-y divide-border">
            {integrations.map((i) => (
              <div key={i.name} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                <Badge tone={i.ok ? "good" : "neutral"}>{i.ok ? "OK" : "Off"}</Badge>
                <div><p className="font-medium text-fg">{i.name}</p><p className="text-muted">{i.detail}</p></div>
              </div>
            ))}
          </div>
        </Card>

        <Card id="jobs" className="xl:col-span-2">
          <CardHeader title="Scheduled research" description="Runs via Vercel Cron (/api/cron/run). Jobs are locked while running, retried with backoff on failure, and alert you after 3 consecutive failures." />
          <Table>
            <thead><tr><Th>Job</Th><Th>Frequency</Th><Th>Enabled</Th><Th>Last run</Th><Th>Next run</Th><Th>Last result</Th><Th /></tr></thead>
            <tbody>
              {d.jobs.map((j) => (
                <tr key={j.id}>
                  <Td><p className="font-medium">{j.kind.replace(/_/g, " ")}</p><p className="max-w-md text-[11px] text-faint">{JOB_DESCRIPTIONS[j.kind]}</p></Td>
                  <Td><JobToggle id={j.id} enabled={j.enabled} frequency={j.frequency} field="frequency" /></Td>
                  <Td><JobToggle id={j.id} enabled={j.enabled} frequency={j.frequency} field="enabled" /></Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{relTime(j.lastRunAt)}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{j.enabled && j.nextRunAt ? fmtDate(j.nextRunAt, true) : "—"}</Td>
                  <Td className="max-w-sm text-[11px]">
                    {j.lastStatus && <Badge tone={j.lastStatus === "succeeded" ? "good" : j.lastStatus === "failed" ? "bad" : "neutral"}>{j.lastStatus}</Badge>}
                    {j.consecutiveFailures > 0 && <span className="ml-1 text-bad">{j.consecutiveFailures} failure(s)</span>}
                    <span className="ml-1 text-faint">{j.lastError ?? (j.lastSummary ? Object.entries(j.lastSummary).filter(([k]) => k !== "ms").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : v}`).join(" · ") : "")}</span>
                  </Td>
                  <Td><ActionButton size="sm" variant="secondary" endpoint="/api/jobs/run" body={{ kind: j.kind }}>Run now</ActionButton></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card id="demo" className="xl:col-span-2">
          <CardHeader title="Demo data" description="Synthetic products for exploring the platform. Every demo record is labelled DEMO, uses the “demo” data source, and is excluded from learning and from external API calls." />
          <CardBody className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{d.demo} demo product(s) loaded.</span>
            <ActionButton endpoint="/api/demo" variant="secondary" disabled={d.demo > 0}>Load demo data</ActionButton>
            <ActionButton endpoint="/api/demo" method="DELETE" variant="danger" disabled={d.demo === 0} confirm="Remove all demo products, suppliers, candidates and reports?">Remove demo data</ActionButton>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
