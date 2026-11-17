"use client";
import * as React from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";
import { cn } from "@/lib/utils";

export function AiSettings({ model, budget, models }: { model: string; budget: number | null; models: Array<{ id: string; label: string; description: string }> }) {
  const { submit, pending, error } = useSubmit();
  const [m, setM] = React.useState(model);
  const [b, setB] = React.useState(budget === null ? "" : String(budget));
  const [saved, setSaved] = React.useState(false);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {models.map((x) => (
          <label key={x.id} className={cn("cursor-pointer rounded-lg border p-3 text-xs", m === x.id ? "border-accent bg-accent/10" : "border-border hover:border-border-strong")}>
            <input type="radio" name="model" className="sr-only" checked={m === x.id} onChange={() => setM(x.id)} />
            <p className="text-sm font-medium text-fg">{x.label}</p>
            <p className="mt-0.5 text-muted">{x.description}</p>
            <p className="mt-1 font-mono text-[10px] text-faint">{x.id}</p>
          </label>
        ))}
      </div>
      <Field label="Monthly AI budget ($)" hint="AI requests are refused once this month's metered spend reaches the budget. Leave empty for no cap.">
        <Input type="number" min="0" step="1" value={b} onChange={(e) => setB(e.target.value)} />
      </Field>
      <FormError error={error} />
      <Button size="sm" loading={pending} onClick={async () => { const r = await submit("/api/settings/preferences", { aiModel: m, aiMonthlyBudgetUsd: b === "" ? null : Number(b) }, { method: "PATCH" }); setSaved(r !== undefined); }}>Save AI settings</Button>
      {saved && <span className="ml-2 text-xs text-good">Saved</span>}
    </div>
  );
}

export function WeightsEditor({ initial, labels }: { initial: Record<string, number>; labels: Record<string, string> }) {
  const { submit, pending, error } = useSubmit<{ version: number; rescored: number }>();
  const [w, setW] = React.useState(initial);
  const [reason, setReason] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <div className="space-y-3">
      {Object.keys(initial).map((k) => (
        <div key={k} className="flex items-center gap-3 text-xs">
          <span className="w-56 text-muted">{labels[k] ?? k}</span>
          <input type="range" min={0} max={40} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="flex-1 accent-[#7c6cff]" />
          <Input type="number" className="h-7 w-16 text-xs" min={0} max={100} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} />
        </div>
      ))}
      <p className={cn("text-xs", sum === 100 ? "text-good" : "text-bad")}>Total: {sum}% {sum !== 100 && "(must equal 100%)"}</p>
      <Field label="Reason for this change (recorded in version history)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-14" /></Field>
      <FormError error={error} />
      <Button size="sm" loading={pending} disabled={sum !== 100 || reason.trim().length < 3} onClick={async () => {
        const r = await submit("/api/settings/weights", { weights: w, reason, source: "user" }, { method: "PUT" });
        if (r) { setMsg(`Saved as version ${r.version}; ${r.rescored} products rescored.`); setReason(""); }
      }}>Save new weight version</Button>
      {msg && <p className="text-xs text-good">{msg}</p>}
    </div>
  );
}

type Prefs = { testingBudgetUsd: number | null; weeklyHours: number | null; targetMarginPct: number | null; maxSupplierCost: number | null; preferredCategoryIds: string[]; avoidedKeywords: string[] };
export function PreferencesForm({ prefs, categories, alertDefaults, feeDefaults }: { prefs: Prefs; categories: Array<{ id: string; name: string }>; alertDefaults: Record<string, number>; feeDefaults: Record<string, number> }) {
  const { submit, pending, error } = useSubmit();
  const [saved, setSaved] = React.useState(false);
  const [v, setV] = React.useState({
    testingBudgetUsd: prefs.testingBudgetUsd ?? "", weeklyHours: prefs.weeklyHours ?? "", targetMarginPct: prefs.targetMarginPct ?? "", maxSupplierCost: prefs.maxSupplierCost ?? "",
    preferredCategoryIds: prefs.preferredCategoryIds, avoidedKeywords: prefs.avoidedKeywords.join(", "),
  });
  const [alerts, setAlerts] = React.useState(alertDefaults);
  const [fees, setFees] = React.useState(feeDefaults);
  const num = (x: unknown) => (x === "" ? null : Number(x));
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const r = await submit("/api/settings/preferences", {
        testingBudgetUsd: num(v.testingBudgetUsd), weeklyHours: num(v.weeklyHours), targetMarginPct: num(v.targetMarginPct), maxSupplierCost: num(v.maxSupplierCost),
        preferredCategoryIds: v.preferredCategoryIds, avoidedKeywords: v.avoidedKeywords.split(",").map((s) => s.trim()).filter(Boolean),
        alertThresholds: Object.fromEntries(Object.entries(alerts).map(([k, x]) => [k, Number(x)])),
        feeSettings: Object.fromEntries(Object.entries(fees).map(([k, x]) => [k, Number(x)])),
      }, { method: "PATCH" });
      setSaved(r !== undefined);
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Testing budget ($)"><Input type="number" min="0" value={v.testingBudgetUsd} onChange={(e) => setV({ ...v, testingBudgetUsd: e.target.value })} /></Field>
        <Field label="Hours per week for testing"><Input type="number" min="0" step="0.5" value={v.weeklyHours} onChange={(e) => setV({ ...v, weeklyHours: e.target.value })} /></Field>
        <Field label="Target margin (%)"><Input type="number" min="0" max="100" value={v.targetMarginPct} onChange={(e) => setV({ ...v, targetMarginPct: e.target.value })} /></Field>
        <Field label="Max supplier cost ($)"><Input type="number" min="0" value={v.maxSupplierCost} onChange={(e) => setV({ ...v, maxSupplierCost: e.target.value })} /></Field>
        <Field label="Discovery categories" hint="Empty = all categories with seed keywords" className="sm:col-span-2">
          <Select multiple className="h-28 py-1" value={v.preferredCategoryIds} onChange={(e) => setV({ ...v, preferredCategoryIds: [...e.target.selectedOptions].map((o) => o.value) })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Avoid keywords in discovery (comma separated)" className="sm:col-span-2"><Input value={v.avoidedKeywords} onChange={(e) => setV({ ...v, avoidedKeywords: e.target.value })} /></Field>
      </div>
      <p className="text-xs font-medium">Default alert thresholds</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(alerts).map(([k, x]) => <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()}><Input type="number" value={x} min={k === "declinePct" ? -100 : 1} onChange={(e) => setAlerts({ ...alerts, [k]: Number(e.target.value) })} /></Field>)}
      </div>
      <p className="text-xs font-medium">Fees used in scoring and the calculator</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(fees).map(([k, x]) => <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()}><Input type="number" step="0.01" min="0" value={x} onChange={(e) => setFees({ ...fees, [k]: Number(e.target.value) })} /></Field>)}
      </div>
      <FormError error={error} />
      <Button type="submit" size="sm" loading={pending}>Save preferences</Button>
      {saved && <span className="ml-2 text-xs text-good">Saved</span>}
    </form>
  );
}

export function JobToggle({ id, enabled, frequency, field }: { id: string; enabled: boolean; frequency: string; field: "enabled" | "frequency" }) {
  const { submit, pending } = useSubmit();
  if (field === "enabled")
    return <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => submit(`/api/jobs/${id}`, { enabled: e.target.checked }, { method: "PATCH" })} aria-label="Enabled" />;
  return (
    <Select className="h-7 w-28 text-xs" value={frequency} disabled={pending} onChange={(e) => submit(`/api/jobs/${id}`, { frequency: e.target.value }, { method: "PATCH" })}>
      <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manual only</option>
    </Select>
  );
}
