import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { uuid } from "@/lib/validation/common";
import { Badge, Card, CardBody, Notice, PageHeader } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { JsonView } from "@/components/reports/json-view";
import { fmtDate } from "@/lib/utils";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [r] = await withUser(user.id, (db) => db<{ id: string; kind: string; title: string; model: string | null; output: unknown; productId: string | null; isDemo: boolean; createdAt: Date; productName: string | null }[]>`
    select r.*, p.name as product_name from public.research_reports r left join public.products p on p.id = r.product_id where r.id = ${id}`);
  if (!r) notFound();
  return (
    <>
      <PageHeader
        title={r.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{r.kind.replace(/_/g, " ")}</Badge>
            {r.model ? <Badge tone="accent">AI · {r.model}</Badge> : <Badge tone="good">Deterministic</Badge>}
            {r.isDemo && <DemoBadge />}
            <span className="text-faint">{fmtDate(r.createdAt, true)}</span>
            {r.productId && <Link className="text-accent" href={`/products/${r.productId}`}>{r.productName} →</Link>}
          </span>
        }
      />
      {r.model && <div className="mb-4"><Notice tone="info">AI interpretation generated from the platform data at the time shown. It explains recorded evidence and does not contain new measurements.</Notice></div>}
      {r.isDemo && <div className="mb-4"><Notice tone="demo">Built from synthetic demo data — illustrative only.</Notice></div>}
      <Card><CardBody><JsonView value={r.output} /></CardBody></Card>
    </>
  );
}
