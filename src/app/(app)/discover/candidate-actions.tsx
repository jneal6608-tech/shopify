"use client";
import { ActionButton } from "@/components/ui/action";

export function CandidateActions({ id, query }: { id: string; query: string; categories: Array<{ id: string; name: string }> }) {
  return (
    <div className="flex justify-end gap-2">
      <ActionButton size="sm" endpoint={`/api/discovery/${id}/promote`} redirectTo={(d) => `/products/${(d as { productId: string }).productId}`}>
        Research “{query.length > 18 ? query.slice(0, 18) + "…" : query}”
      </ActionButton>
      <ActionButton size="sm" variant="ghost" endpoint={`/api/discovery/${id}/dismiss`}>Dismiss</ActionButton>
    </div>
  );
}

export function RunDiscoveryButton() {
  return <ActionButton size="sm" variant="secondary" endpoint="/api/jobs/run" body={{ kind: "daily_discovery" }}>Run discovery now</ActionButton>;
}
