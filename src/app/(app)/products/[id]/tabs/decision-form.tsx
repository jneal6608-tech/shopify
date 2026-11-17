"use client";
import * as React from "react";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";

const REASONS = ["Strong demand data", "Great faceless content fit", "Healthy margin", "Low competition", "Weak demand", "Too competitive", "Poor margin", "Supplier concerns", "Shipping issues", "Gut feel", "Tested: strong clicks", "Tested: no sales"];

export function DecisionForm({ productId }: { productId: string }) {
  const { submit, pending, error } = useSubmit();
  const [decision, setDecision] = React.useState("selected");
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [margin, setMargin] = React.useState("");
  return (
    <Card>
      <CardHeader title="Record a decision" description="Why you selected, rejected, continued or stopped" />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await submit(`/api/products/${productId}/decisions`, { decision, reasons, notes, outcome: outcome || null, actualMarginPct: margin === "" ? null : Number(margin) });
            if (r !== undefined) {
              setReasons([]);
              setNotes("");
            }
          }}
        >
          <Field label="Decision">
            <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
              {["selected", "rejected", "continued", "paused", "discontinued", "scaled"].map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button type="button" key={r} onClick={() => setReasons((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]))} className={`rounded-md border px-2 py-0.5 text-[11px] ${reasons.includes(r) ? "border-accent bg-accent/15 text-fg" : "border-border text-muted"}`}>{r}</button>
            ))}
          </div>
          <Field label="Notes"><Textarea value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Outcome (if known)">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Not yet known</option><option value="performed_well">Performed well</option><option value="performed_poorly">Performed poorly</option><option value="inconclusive">Inconclusive</option>
              </Select>
            </Field>
            <Field label="Actual margin %"><Input type="number" step="0.1" value={margin} onChange={(e) => setMargin(e.target.value)} /></Field>
          </div>
          <FormError error={error} />
          <Button type="submit" variant="secondary" className="w-full" loading={pending}>Save decision</Button>
        </form>
      </CardBody>
    </Card>
  );
}
