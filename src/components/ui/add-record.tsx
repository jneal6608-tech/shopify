"use client";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "./primitives";
import { Modal } from "./action";
import { RecordForm, type FieldDef } from "./record-form";
import { COMPETITOR_FIELDS, REFERENCE_VIDEO_FIELDS, SUPPLIER_FIELDS, offerFields } from "@/components/forms/defs";

const PRESETS: Record<string, FieldDef[]> = { competitor: COMPETITOR_FIELDS, referenceVideo: REFERENCE_VIDEO_FIELDS, supplier: SUPPLIER_FIELDS };

export function AddRecordButton({
  preset,
  suppliers,
  endpoint,
  title,
  label,
  method,
  initial,
  size = "sm",
  variant = "secondary",
}: {
  preset: "competitor" | "referenceVideo" | "supplier" | "offer";
  suppliers?: Array<{ id: string; name: string }>;
  endpoint: string;
  title: string;
  label: React.ReactNode;
  method?: string;
  initial?: Record<string, unknown>;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const fields = preset === "offer" ? offerFields(suppliers ?? []) : PRESETS[preset];
  return (
    <Modal title={title} wide trigger={(open) => <Button size={size} variant={variant} onClick={open}>{!method && <Plus className="h-3.5 w-3.5" />}{label}</Button>}>
      {(close) => (
        <RecordForm
          fields={fields}
          endpoint={endpoint}
          method={method}
          initial={initial}
          onDone={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </Modal>
  );
}
