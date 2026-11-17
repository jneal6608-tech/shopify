"use client";
import * as React from "react";
import Link from "next/link";
import { Columns3 } from "lucide-react";

const KEY = "dropship-compare-ids";
const EVT = "compare-ids-changed";

export function getCompareIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
function setCompareIds(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVT));
}
export function useCompareIds() {
  const [ids, setIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    const sync = () => setIds(getCompareIds());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = (id: string) => {
    const cur = getCompareIds();
    setCompareIds(cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]);
  };
  const clear = () => setCompareIds([]);
  return { ids, toggle, clear, full: ids.length >= 5 };
}

export function CompareToggle({ id, compact }: { id: string; compact?: boolean }) {
  const { ids, toggle, full } = useCompareIds();
  const on = ids.includes(id);
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      disabled={!on && full}
      title={!on && full ? "Up to 5 products can be compared" : on ? "Remove from comparison" : "Add to comparison"}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${on ? "border-accent/50 bg-accent/15 text-fg" : "border-border text-muted hover:text-fg"}`}
    >
      <Columns3 className="h-3 w-3" />
      {compact ? (on ? "✓" : "+") : on ? "Comparing" : "Compare"}
    </button>
  );
}

export function CompareTray() {
  const { ids, clear } = useCompareIds();
  if (ids.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-accent/40 bg-panel px-3 py-2 shadow-lg shadow-black/40">
      <span className="text-xs text-muted">{ids.length}/5 selected</span>
      <Link href={`/compare?ids=${ids.join(",")}`} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">Compare</Link>
      <button onClick={clear} className="text-xs text-faint hover:text-fg">Clear</button>
    </div>
  );
}
