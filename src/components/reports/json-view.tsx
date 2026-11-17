import * as React from "react";

const title = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Readable renderer for structured report output (AI or deterministic). */
export function JsonView({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-faint">—</span>;
  if (typeof value === "string") return <span className="whitespace-pre-wrap text-muted">{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") return <span className="tabular-nums text-fg">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-faint">None</span>;
    if (value.every((v) => typeof v !== "object" || v === null))
      return <ul className="list-disc space-y-0.5 pl-5 text-muted">{value.map((v, i) => <li key={i}>{String(v)}</li>)}</ul>;
    return (
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-md border border-border/70 p-2"><JsonView value={v} depth={depth + 1} /></div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <div className={depth === 0 ? "space-y-4" : "space-y-1.5"}>
      {entries.map(([k, v]) => (
        <div key={k} className={depth === 0 ? "" : "text-xs"}>
          <p className={depth === 0 ? "mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint" : "inline text-faint"}>{title(k)}{depth > 0 && ": "}</p>
          {depth === 0 ? <div className="text-sm"><JsonView value={v} depth={depth + 1} /></div> : <JsonView value={v} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}
