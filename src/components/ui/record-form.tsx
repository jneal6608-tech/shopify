"use client";
import * as React from "react";
import { Button, Field, Input, Select, Textarea } from "./primitives";
import { FormError, useSubmit } from "./action";

export type FieldDef =
  | { name: string; label: string; type: "text" | "url" | "date"; required?: boolean; placeholder?: string; span?: 2; hint?: string }
  | { name: string; label: string; type: "number"; required?: boolean; step?: string; min?: number; span?: 2; hint?: string }
  | { name: string; label: string; type: "textarea"; span?: 2; hint?: string }
  | { name: string; label: string; type: "list"; span?: 2; hint?: string }
  | { name: string; label: string; type: "select"; options: Array<{ value: string; label: string }>; span?: 2; hint?: string }
  | { name: string; label: string; type: "bool"; span?: 2; hint?: string };

/** Generic form: renders fields, converts values, submits JSON to an endpoint. */
export function RecordForm({ fields, endpoint, method = "POST", initial = {}, submitLabel = "Save", onDone }: { fields: FieldDef[]; endpoint: string; method?: string; initial?: Record<string, unknown>; submitLabel?: string; onDone?: () => void }) {
  const { submit, pending, error } = useSubmit();
  const [v, setV] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => {
        const raw = initial[f.name];
        if (f.type === "list") return [f.name, Array.isArray(raw) ? raw.join("\n") : ""];
        if (f.type === "bool") return [f.name, raw === true ? "yes" : raw === false ? "no" : ""];
        if (f.type === "date") return [f.name, raw ? String(raw).slice(0, 10) : new Date().toISOString().slice(0, 10)];
        if (f.type === "select") return [f.name, raw === undefined || raw === null ? f.options[0]?.value ?? "" : String(raw)];
        return [f.name, raw === undefined || raw === null ? "" : String(raw)];
      }),
    ),
  );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = {};
        for (const f of fields) {
          const x = v[f.name];
          if (f.type === "number") body[f.name] = x === "" ? null : Number(x);
          else if (f.type === "list") body[f.name] = x.split("\n").map((s) => s.trim()).filter(Boolean);
          else if (f.type === "bool") body[f.name] = x === "" ? null : x === "yes";
          else if (f.type === "url") body[f.name] = x.trim() === "" ? null : x.trim();
          else body[f.name] = x;
        }
        const r = await submit(endpoint, body, { method });
        if (r !== undefined) onDone?.();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint ?? (f.type === "list" ? "One per line" : undefined)} className={f.span === 2 || f.type === "textarea" || f.type === "list" ? "sm:col-span-2" : undefined}>
            {f.type === "textarea" || f.type === "list" ? (
              <Textarea value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            ) : f.type === "select" ? (
              <Select value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : f.type === "bool" ? (
              <Select value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </Select>
            ) : (
              <Input
                type={f.type}
                required={"required" in f ? f.required : undefined}
                step={f.type === "number" ? (f.step ?? "any") : undefined}
                min={f.type === "number" ? (f.min ?? 0) : undefined}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                value={v[f.name]}
                onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
      <FormError error={error} />
      <div className="flex justify-end"><Button type="submit" loading={pending}>{submitLabel}</Button></div>
    </form>
  );
}
