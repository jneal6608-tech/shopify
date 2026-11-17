"use client";
import * as React from "react";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";

type Status = { key: string; name: string; configured: boolean; setupHelp: string };
type Result = { source: string; status: string; inserted: number; skipped: number; message?: string };

export function CollectPanel({ productId, defaultQuery, statuses }: { productId: string; defaultQuery: string; statuses: Status[] }) {
  const { submit, pending, error } = useSubmit<{ results: Result[]; score: { total: number; confidence: number } }>();
  const [query, setQuery] = React.useState(defaultQuery);
  const [results, setResults] = React.useState<Result[] | null>(null);
  const configured = statuses.filter((s) => s.configured);
  return (
    <Card>
      <CardHeader title="Collect data" description="Pull fresh observations from connected APIs" />
      <CardBody className="space-y-3">
        <Field label="Search query"><Input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} /></Field>
        <ul className="space-y-1 text-xs">
          {statuses.map((s) => (
            <li key={s.key} className="flex items-start gap-2">
              <span className={s.configured ? "text-good" : "text-faint"}>{s.configured ? "●" : "○"}</span>
              <span className="flex-1">
                <span className={s.configured ? "text-fg" : "text-muted"}>{s.name}</span>
                {!s.configured && <details className="text-faint"><summary className="cursor-pointer">Not configured — how to connect</summary><p className="mt-1">{s.setupHelp}</p></details>}
              </span>
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          loading={pending}
          disabled={configured.length === 0}
          onClick={async () => {
            const r = await submit(`/api/products/${productId}/collect`, { query, sources: configured.map((s) => s.key) });
            if (r) setResults(r.results);
          }}
        >
          {configured.length ? `Collect from ${configured.length} source${configured.length > 1 ? "s" : ""}` : "No API sources configured"}
        </Button>
        <FormError error={error} />
        {results && (
          <ul className="space-y-1 text-xs">
            {results.map((r) => (
              <li key={r.source} className={r.status === "ok" ? "text-good" : r.status === "error" ? "text-bad" : "text-muted"}>
                {r.source}: {r.status === "ok" ? `${r.inserted} new, ${r.skipped} duplicate` : r.message}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function CsvImport({ productId }: { productId: string }) {
  const { submit, pending, error } = useSubmit<{ term: string; terms: string[]; inserted: number; skipped: number }>();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [termIndex, setTermIndex] = React.useState(0);
  const [geo, setGeo] = React.useState("US");
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader title="Import Google Trends CSV" description="multiTimeline.csv from trends.google.com" />
      <CardBody className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-xs file:text-fg" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Term column"><Select value={termIndex} onChange={(e) => setTermIndex(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>Column {i + 1}</option>)}</Select></Field>
          <Field label="Region"><Input value={geo} maxLength={20} onChange={(e) => setGeo(e.target.value)} /></Field>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          loading={pending}
          onClick={async () => {
            const f = fileRef.current?.files?.[0];
            if (!f) return setMsg("Choose a CSV file first.");
            if (f.size > 900_000) return setMsg("File is too large.");
            const csv = await f.text();
            const r = await submit(`/api/products/${productId}/import-trends`, { csv, termIndex, geo });
            if (r) setMsg(`Imported “${r.term}”: ${r.inserted} new points, ${r.skipped} duplicates.${r.terms.length > 1 ? ` File terms: ${r.terms.join(", ")}.` : ""}`);
          }}
        >
          Import
        </Button>
        {msg && <p className="text-xs text-muted">{msg}</p>}
        <FormError error={error} />
      </CardBody>
    </Card>
  );
}

export function ManualObservationForm({ productId, metrics }: { productId: string; metrics: Array<{ key: string; label: string }> }) {
  const { submit, pending, error } = useSubmit<{ inserted: number; message?: string }>();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [v, setV] = React.useState({ sourceKey: "tiktok_creative_center_manual", metric: "tiktok_video_count", value: "", observedAt: new Date().toISOString().slice(0, 10), query: "", sourceUrl: "", isEstimate: false });
  return (
    <Card>
      <CardHeader title="Record a manual observation" description="A source URL is required so it can be re-verified" />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await submit(`/api/products/${productId}/observations`, { ...v, value: Number(v.value) });
            if (r) {
              setMsg(r.message ?? "Saved.");
              setV((s) => ({ ...s, value: "" }));
            }
          }}
        >
          <Field label="Source">
            <Select value={v.sourceKey} onChange={(e) => setV({ ...v, sourceKey: e.target.value })}>
              <option value="tiktok_creative_center_manual">TikTok Creative Center</option>
              <option value="amazon_manual">Amazon listing</option>
              <option value="manual">Other manual research</option>
            </Select>
          </Field>
          <Field label="Metric">
            <Select value={v.metric} onChange={(e) => setV({ ...v, metric: e.target.value })}>{metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Value"><Input required type="number" min="0" step="any" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} /></Field>
            <Field label="Observed on"><Input required type="date" value={v.observedAt} onChange={(e) => setV({ ...v, observedAt: e.target.value })} /></Field>
          </div>
          <Field label="Query / hashtag"><Input value={v.query} maxLength={300} onChange={(e) => setV({ ...v, query: e.target.value })} /></Field>
          <Field label="Source URL"><Input required type="url" value={v.sourceUrl} onChange={(e) => setV({ ...v, sourceUrl: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={v.isEstimate} onChange={(e) => setV({ ...v, isEstimate: e.target.checked })} /> This is an estimate (e.g. read off a rounded figure)</label>
          <FormError error={error} />
          {msg && <p className="text-xs text-good">{msg}</p>}
          <Button type="submit" variant="secondary" className="w-full" loading={pending}>Save observation</Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function DeleteObservation({ id }: { id: number }) {
  const { submit, pending } = useSubmit();
  return (
    <button disabled={pending} className="text-[11px] text-faint hover:text-bad" onClick={() => window.confirm("Delete this manual observation?") && submit(`/api/observations/${id}`, {}, { method: "DELETE" })}>
      delete
    </button>
  );
}
