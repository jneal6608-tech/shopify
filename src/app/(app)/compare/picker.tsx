"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/primitives";

export function ComparePicker({ selected, all }: { selected: Array<{ id: string; name: string }>; all: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const go = (ids: string[]) => router.push(`/compare?ids=${ids.join(",")}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs">
          {p.name}
          <button aria-label={`Remove ${p.name}`} className="text-faint hover:text-bad" onClick={() => go(selected.filter((x) => x.id !== p.id).map((x) => x.id))}>×</button>
        </span>
      ))}
      {selected.length < 5 && (
        <Select className="h-8 w-60 text-xs" value="" onChange={(e) => e.target.value && go([...selected.map((x) => x.id), e.target.value])}>
          <option value="">+ Add product ({selected.length}/5)</option>
          {all.filter((a) => !selected.some((s) => s.id === a.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      )}
    </div>
  );
}
