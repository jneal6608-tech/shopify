import Link from "next/link";
import { withUser } from "@/lib/db";
import type { ProductOverview } from "@/lib/services/products";
import { FACELESS_FORMATS, RUBRIC_HELP } from "@/lib/analytics/rubrics";
import { Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge, Provenance } from "@/components/ui/domain";
import { AddRecordButton } from "@/components/ui/add-record";
import { ActionButton } from "@/components/ui/action";
import { AiButton } from "@/components/ui/ai-button";
import { fmtDate, fmtNum } from "@/lib/utils";
import { AssessmentEditor } from "./assessment-editor";
import { ContentPackView } from "@/components/content/content-pack-view";
import type { ContentPack } from "@/lib/ai/schemas";

export async function ContentTab({ userId, product: p }: { userId: string; product: ProductOverview }) {
  const data = await withUser(userId, async (db) => ({
    assessments: await db<{ kind: string; ratings: Record<string, number>; assessedBy: "user" | "ai"; notes: string; createdAt: Date }[]>`
      select distinct on (kind) kind, ratings, assessed_by, notes, created_at from public.product_assessments where product_id = ${p.id} order by kind, created_at desc`,
    packs: await db<{ id: string; model: string; payload: ContentPack; createdAt: Date }[]>`
      select id, model, payload, created_at from public.content_packs where product_id = ${p.id} order by created_at desc limit 5`,
    refs: await db<{ id: string; platform: string; url: string | null; creator: string; hookText: string; viewsObserved: number | null; likesObserved: number | null; observedAt: Date; isDemo: boolean }[]>`
      select * from public.reference_videos where product_id = ${p.id} order by observed_at desc`,
    patterns: (await db<{ id: string; createdAt: Date }[]>`select id, created_at from public.research_reports where product_id = ${p.id} and kind = 'content_pattern_analysis' order by created_at desc limit 1`)[0],
  }));
  const a = (k: string) => data.assessments.find((x) => x.kind === k);
  const pack = data.packs[0];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Faceless content potential"
            description={RUBRIC_HELP.content}
            action={<AiButton size="sm" variant="secondary" endpoint={`/api/products/${p.id}/ai/assessments`}>Suggest ratings (AI)</AiButton>}
          />
          <CardBody>
            {a("content")?.assessedBy === "ai" && <div className="mb-3"><Notice tone="info" title="AI estimate">These ratings were suggested by AI ({fmtDate(a("content")!.createdAt)}). Saving them yourself marks them as your rating and raises confidence.{a("content")!.notes && <span className="mt-1 block text-faint">{a("content")!.notes}</span>}</Notice></div>}
            <AssessmentEditor
              productId={p.id}
              formats={FACELESS_FORMATS.map((f) => ({ key: f.key, label: f.label }))}
              content={a("content")?.ratings ?? null}
              problem={a("problem")?.ratings ?? null}
              longevity={a("longevity")?.ratings ?? null}
              basis={{ content: a("content")?.assessedBy ?? null, problem: a("problem")?.assessedBy ?? null, longevity: a("longevity")?.assessedBy ?? null }}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Reference videos" description="Public videos you studied. Counts only as displayed — never estimated." action={<AddRecordButton preset="referenceVideo" endpoint={`/api/products/${p.id}/reference-videos`} title="Record a reference video" label="Add" />} />
          <CardBody className="space-y-2">
            {data.refs.length === 0 && <p className="text-xs text-muted">None yet.</p>}
            {data.refs.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-2 text-xs">
                <div className="flex items-center gap-2"><span className="font-medium capitalize">{r.platform}</span>{r.isDemo && <DemoBadge />}<span className="text-faint">{r.creator}</span><span className="ml-auto text-faint">{fmtDate(r.observedAt)}</span><ActionButton size="sm" variant="ghost" endpoint={`/api/reference-videos/${r.id}`} method="DELETE">×</ActionButton></div>
                {r.hookText && <p className="mt-1 text-muted">“{r.hookText}”</p>}
                <p className="mt-1 text-faint">{r.viewsObserved !== null ? `${fmtNum(r.viewsObserved)} views` : "views not recorded"}{r.likesObserved !== null && ` · ${fmtNum(r.likesObserved)} likes`}{r.url && <> · <a className="text-accent" href={r.url} target="_blank" rel="noreferrer noopener">open</a></>}</p>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AiButton size="sm" variant="secondary" disabled={data.refs.length === 0} endpoint={`/api/products/${p.id}/ai/content-patterns`}>Analyse patterns</AiButton>
              {data.patterns && <Link href={`/reports/${data.patterns.id}`} className="text-xs text-accent">Latest pattern analysis →</Link>}
            </div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="AI content pack"
          description={pack ? `${pack.model} · ${fmtDate(pack.createdAt, true)} · 10 concepts · 10 hooks · 5 scripts` : "10 concepts, 10 hooks and 5 complete faceless scripts with shot lists"}
          action={<AiButton size="sm" endpoint={`/api/products/${p.id}/ai/content-pack`}>{pack ? "Generate new pack" : "Generate content pack"}</AiButton>}
        />
        <CardBody>{pack ? <ContentPackView pack={pack.payload} /> : <p className="text-xs text-muted">Uses product details, assessments, competitor angles and — once you have test data — your own best-performing hooks and formats.</p>}</CardBody>
      </Card>
      {data.packs.length > 1 && (
        <Card>
          <CardHeader title="Earlier packs" />
          <Table><thead><tr><Th>Generated</Th><Th>Model</Th><Th>Positioning</Th></tr></thead><tbody>
            {data.packs.slice(1).map((k) => <tr key={k.id}><Td className="text-xs">{fmtDate(k.createdAt, true)}</Td><Td className="text-xs text-faint">{k.model}</Td><Td className="text-xs text-muted">{k.payload.positioning.slice(0, 160)}…</Td></tr>)}
          </tbody></Table>
        </Card>
      )}
      <p className="text-[11px] text-faint">Scores use the latest assessment of each kind. <Provenance kind="assessment_user" /> ratings carry more weight in confidence than <Provenance kind="assessment_ai" />.</p>
    </div>
  );
}
