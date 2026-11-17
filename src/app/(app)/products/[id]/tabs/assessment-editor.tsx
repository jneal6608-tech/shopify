"use client";
import * as React from "react";
import { Button, Badge } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";

const SCALE = ["Not viable", "Weak", "Good", "Excellent"];

export function AssessmentEditor({
  productId,
  formats,
  content,
  problem,
  longevity,
  basis,
}: {
  productId: string;
  formats: Array<{ key: string; label: string }>;
  content: Record<string, number> | null;
  problem: Record<string, number> | null;
  longevity: Record<string, number> | null;
  basis: Record<string, "user" | "ai" | null>;
}) {
  const { submit, pending, error } = useSubmit();
  const [c, setC] = React.useState<Record<string, number>>(() => Object.fromEntries(formats.map((f) => [f.key, content?.[f.key] ?? 0])));
  const [pr, setPr] = React.useState({ severity: problem?.severity ?? 0, frequency: problem?.frequency ?? 0, clarity: problem?.clarity ?? 0 });
  const [lo, setLo] = React.useState({ evergreen: longevity?.evergreen ?? 0, repeatPurchase: longevity?.repeatPurchase ?? 0 });
  const [saved, setSaved] = React.useState<string | null>(null);

  const save = async (kind: string, ratings: unknown) => {
    const r = await submit(`/api/products/${productId}/assessments`, { kind, ratings });
    if (r !== undefined) setSaved(kind);
  };
  const Tag = ({ k }: { k: string }) => (basis[k] ? <Badge tone={basis[k] === "ai" ? "accent" : "info"}>{basis[k] === "ai" ? "AI estimate" : "Your rating"}</Badge> : <Badge>Not rated</Badge>);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2"><p className="text-xs font-medium">Format ratings</p><Tag k="content" /></div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {formats.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{f.label}</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} type="button" title={SCALE[n]} onClick={() => setC({ ...c, [f.key]: n })} className={`h-6 w-6 rounded text-[11px] ${c[f.key] === n ? (n >= 2 ? "bg-good/30 text-good" : n === 1 ? "bg-warn/25 text-warn" : "bg-bad/20 text-bad") : "bg-panel-2 text-faint hover:text-fg"}`}>{n}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" className="mt-3" loading={pending} onClick={() => save("content", c)}>Save format ratings</Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2"><p className="text-xs font-medium">Problem-solving value (0–5)</p><Tag k="problem" /></div>
          {(["severity", "frequency", "clarity"] as const).map((k) => <Slider key={k} label={k} value={pr[k]} onChange={(v) => setPr({ ...pr, [k]: v })} />)}
          <Button size="sm" variant="secondary" className="mt-2" loading={pending} onClick={() => save("problem", pr)}>Save</Button>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2"><p className="text-xs font-medium">Market longevity (0–5)</p><Tag k="longevity" /></div>
          <Slider label="evergreen need" value={lo.evergreen} onChange={(v) => setLo({ ...lo, evergreen: v })} />
          <Slider label="repeat purchase" value={lo.repeatPurchase} onChange={(v) => setLo({ ...lo, repeatPurchase: v })} />
          <Button size="sm" variant="secondary" className="mt-2" loading={pending} onClick={() => save("longevity", lo)}>Save</Button>
        </div>
      </div>
      <FormError error={error} />
      {saved && <p className="text-xs text-good">Saved {saved} assessment as your rating — score recomputed.</p>}
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-1.5 flex items-center gap-3 text-xs text-muted">
      <span className="w-28 capitalize">{label}</span>
      <input type="range" min={0} max={5} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[#7c6cff]" />
      <span className="w-4 text-right tabular-nums text-fg">{value}</span>
    </label>
  );
}
