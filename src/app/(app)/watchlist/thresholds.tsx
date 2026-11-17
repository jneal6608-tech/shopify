"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/action";
import { RecordForm } from "@/components/ui/record-form";

export function ThresholdEditor({ productId, initial }: { productId: string; initial: Record<string, number> }) {
  const router = useRouter();
  return (
    <Modal title="Alert thresholds for this product" trigger={(open) => <Button size="sm" variant="ghost" onClick={open}>Thresholds</Button>}>
      {(close) => (
        <ThresholdForm productId={productId} initial={initial} onDone={() => { close(); router.refresh(); }} />
      )}
    </Modal>
  );
}

function ThresholdForm({ productId, initial, onDone }: { productId: string; initial: Record<string, number>; onDone: () => void }) {
  return (
    <RecordForm
      endpoint={`/api/watchlist/${productId}/thresholds`}
      method="PATCH"
      initial={initial}
      onDone={onDone}
      fields={[
        { name: "scoreChange", label: "Opportunity score change (points)", type: "number", step: "1" },
        { name: "substantialGrowthPct", label: "Substantial growth (%)", type: "number", step: "1" },
        { name: "declinePct", label: "Demand decline (%, negative)", type: "number", step: "1", min: -100 },
        { name: "competitionIncreasePct", label: "Active-ad increase (%)", type: "number", step: "1" },
      ]}
    />
  );
}
