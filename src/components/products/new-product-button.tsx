"use client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/action";
import { ProductForm, type ProductFormValues } from "./product-form";

export function NewProductButton({ categories, initial, label = "Add product" }: { categories: Array<{ id: string; name: string }>; initial?: Partial<ProductFormValues>; label?: string }) {
  return (
    <Modal title="Add product to research" wide trigger={(open) => <Button onClick={open}><Plus className="h-4 w-4" />{label}</Button>}>
      {(close) => <ProductForm categories={categories} initial={initial} onDone={close} />}
    </Modal>
  );
}
