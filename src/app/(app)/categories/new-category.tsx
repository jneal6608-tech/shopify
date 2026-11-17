"use client";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/action";
import { RecordForm } from "@/components/ui/record-form";

export function NewCategoryButton() {
  const router = useRouter();
  return (
    <Modal title="Custom category" trigger={(open) => <Button onClick={open}><Plus className="h-4 w-4" />New category</Button>}>
      {(close) => (
        <RecordForm
          endpoint="/api/categories"
          onDone={() => { close(); router.refresh(); }}
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
            { name: "description", label: "Description", type: "textarea" },
            { name: "seedKeywords", label: "Seed keywords for discovery", type: "list" },
          ]}
        />
      )}
    </Modal>
  );
}
