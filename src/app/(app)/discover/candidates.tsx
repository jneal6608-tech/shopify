import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { relTime } from "@/lib/utils";
import { CandidateActions, RunDiscoveryButton } from "./candidate-actions";

export function DiscoveryCandidates({
  candidates,
  categories,
}: {
  candidates: Array<{ id: string; query: string; sourceKey: string; evidence: Record<string, unknown>; lastSeenAt: Date; categoryName: string | null; isDemo: boolean }>;
  categories: Array<{ id: string; name: string }>;
}) {
  return (
    <Card>
      <CardHeader
        title="Discovery candidates"
        description="Rising search queries found by scheduled discovery (Google Trends “rising” related queries for your category seed keywords). These are leads, not validated products — promote one to start researching it."
        action={<RunDiscoveryButton />}
      />
      {candidates.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No open candidates. Discovery requires the SerpApi integration (Settings → Integrations).</p>
      ) : (
        <Table>
          <thead><tr><Th>Query</Th><Th>Evidence</Th><Th>Category</Th><Th>Seen</Th><Th /></tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.query} {c.isDemo && <DemoBadge />}</Td>
                <Td className="text-xs text-muted">
                  {typeof c.evidence.risingValue === "string" && <Badge tone="good">{c.evidence.risingValue}</Badge>}{" "}
                  {typeof c.evidence.seed === "string" && <>related to “{c.evidence.seed}”</>}
                  <span className="ml-1 text-faint">({c.sourceKey})</span>
                </Td>
                <Td className="text-xs text-muted">{c.categoryName ?? "—"}</Td>
                <Td className="text-xs text-muted">{relTime(c.lastSeenAt)}</Td>
                <Td><CandidateActions id={c.id} query={c.query} categories={categories} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
