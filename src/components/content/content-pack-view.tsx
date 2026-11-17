import type { ContentPack } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/primitives";
import { FACELESS_FORMATS } from "@/lib/analytics/rubrics";
import { CopyButton } from "./copy-button";

const label = (k: string) => FACELESS_FORMATS.find((f) => f.key === k)?.label ?? k;

export function ContentPackView({ pack }: { pack: ContentPack }) {
  return (
    <div className="space-y-6 text-sm">
      <p className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-muted"><span className="font-medium text-fg">Positioning:</span> {pack.positioning}</p>
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Opening hooks ({pack.hooks.length})</h4>
        <ol className="grid gap-2 sm:grid-cols-2">
          {pack.hooks.map((h, i) => (
            <li key={i} className="rounded-md border border-border p-2 text-xs">
              <div className="flex items-start gap-2"><span className="text-faint">{i + 1}.</span><span className="flex-1 font-medium text-fg">“{h.text}”</span><CopyButton text={h.text} /></div>
              <p className="mt-1 text-faint">{h.type} · {h.visual}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Video concepts ({pack.concepts.length})</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {pack.concepts.map((c, i) => (
            <div key={i} className="rounded-md border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-fg">{c.title}</span><Badge tone="accent">{label(c.format)}</Badge>{c.platforms.map((p) => <Badge key={p}>{p}</Badge>)}</div>
              <p className="mt-1 text-muted">{c.description}</p>
              <p className="mt-1 text-faint"><span className="text-muted">Angle:</span> {c.angle} · <span className="text-muted">Why:</span> {c.whyItWorks}</p>
              <p className="mt-1 text-faint"><span className="text-muted">Differentiation:</span> {c.differentiation}</p>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Scripts ({pack.scripts.length})</h4>
        <div className="space-y-3">
          {pack.scripts.map((s, i) => (
            <details key={i} className="rounded-lg border border-border" open={i === 0}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                <span className="font-medium">{s.title}</span>
                <Badge tone="accent">{label(s.format)}</Badge>
                <Badge>{s.platform}</Badge>
                <Badge>{s.durationSeconds}s · 9:16</Badge>
              </summary>
              <div className="space-y-3 border-t border-border p-3 text-xs">
                <p><span className="text-faint">Hook:</span> <span className="font-medium text-fg">“{s.hook}”</span></p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="text-faint"><th className="py-1 pr-2">#</th><th className="pr-2">Sec</th><th className="pr-2">Shot (faceless)</th><th className="pr-2">On-screen text</th><th>Audio / VO</th></tr></thead>
                    <tbody>{s.shots.map((sh) => <tr key={sh.n} className="border-t border-border/50 align-top text-muted"><td className="py-1 pr-2">{sh.n}</td><td className="pr-2 tabular-nums">{sh.seconds}</td><td className="pr-2">{sh.shot}</td><td className="pr-2">{sh.onScreenText}</td><td>{sh.audio}</td></tr>)}</tbody>
                  </table>
                </div>
                {s.voiceover && <div><p className="text-faint">Voiceover <CopyButton text={s.voiceover} /></p><p className="whitespace-pre-wrap text-muted">{s.voiceover}</p></div>}
                <p><span className="text-faint">Editing style:</span> <span className="text-muted">{s.editingStyle}</span></p>
                {s.textOverlays.length > 0 && <p><span className="text-faint">Text overlays:</span> <span className="text-muted">{s.textOverlays.join(" · ")}</span></p>}
                <div><p className="text-faint">Caption <CopyButton text={`${s.caption}\n\n${s.hashtags.join(" ")}`} /></p><p className="text-muted">{s.caption}</p><p className="mt-1 text-accent/80">{s.hashtags.join(" ")}</p></div>
                <p><span className="text-faint">Call to action:</span> <span className="text-muted">{s.callToAction}</span></p>
              </div>
            </details>
          ))}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Production notes</h4><ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{pack.productionNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Compliance — avoid</h4><ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{pack.complianceNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
      </div>
    </div>
  );
}
