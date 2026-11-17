"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";

export interface ProductFormValues {
  name: string;
  description: string;
  categoryId: string | null;
  imageUrl: string | null;
  niche: string | null;
  targetCustomer: string;
  problemSolved: string;
  keywords: string[];
  estSupplierCost: number | null;
  estShippingCost: number | null;
  estSellingPrice: number | null;
  weightGrams: number | null;
  isFragile: boolean | null;
}

export function ProductForm({
  categories,
  initial,
  productId,
  onDone,
}: {
  categories: Array<{ id: string; name: string }>;
  initial?: Partial<ProductFormValues>;
  productId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { submit, pending, error } = useSubmit<{ id: string }>();
  const [v, setV] = React.useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    categoryId: initial?.categoryId ?? "",
    imageUrl: initial?.imageUrl ?? "",
    niche: initial?.niche ?? "",
    targetCustomer: initial?.targetCustomer ?? "",
    problemSolved: initial?.problemSolved ?? "",
    keywords: (initial?.keywords ?? []).join(", "),
    estSupplierCost: initial?.estSupplierCost ?? "",
    estShippingCost: initial?.estShippingCost ?? "",
    estSellingPrice: initial?.estSellingPrice ?? "",
    weightGrams: initial?.weightGrams ?? "",
    isFragile: initial?.isFragile === null || initial?.isFragile === undefined ? "" : initial.isFragile ? "yes" : "no",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: v.name,
      description: v.description,
      categoryId: v.categoryId || null,
      imageUrl: v.imageUrl || null,
      niche: v.niche || null,
      targetCustomer: v.targetCustomer,
      problemSolved: v.problemSolved,
      keywords: v.keywords.split(",").map((s) => s.trim()).filter(Boolean),
      estSupplierCost: v.estSupplierCost === "" ? null : Number(v.estSupplierCost),
      estShippingCost: v.estShippingCost === "" ? null : Number(v.estShippingCost),
      estSellingPrice: v.estSellingPrice === "" ? null : Number(v.estSellingPrice),
      weightGrams: v.weightGrams === "" ? null : Number(v.weightGrams),
      isFragile: v.isFragile === "" ? null : v.isFragile === "yes",
    };
    const r = await submit(productId ? `/api/products/${productId}` : "/api/products", body, { method: productId ? "PATCH" : "POST" });
    if (r) {
      onDone?.();
      if (!productId) router.push(`/products/${r.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name *" className="sm:col-span-2"><Input required maxLength={200} value={v.name} onChange={set("name")} /></Field>
        <Field label="Category">
          <Select value={v.categoryId} onChange={set("categoryId")}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Niche"><Input maxLength={120} value={v.niche} onChange={set("niche")} placeholder="e.g. dog owners in apartments" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea maxLength={5000} value={v.description} onChange={set("description")} /></Field>
        <Field label="Problem being solved"><Textarea maxLength={1000} value={v.problemSolved} onChange={set("problemSolved")} /></Field>
        <Field label="Potential customer"><Textarea maxLength={1000} value={v.targetCustomer} onChange={set("targetCustomer")} /></Field>
        <Field label="Keywords (comma separated)" hint="Used as search terms for trend collection." className="sm:col-span-2"><Input value={v.keywords} onChange={set("keywords")} /></Field>
        <Field label="Image URL (https)" className="sm:col-span-2"><Input type="url" value={v.imageUrl} onChange={set("imageUrl")} /></Field>
        <Field label="Est. supplier cost ($)"><Input type="number" step="0.01" min="0" value={v.estSupplierCost} onChange={set("estSupplierCost")} /></Field>
        <Field label="Est. shipping cost ($)"><Input type="number" step="0.01" min="0" value={v.estShippingCost} onChange={set("estShippingCost")} /></Field>
        <Field label="Est. selling price ($)"><Input type="number" step="0.01" min="0" value={v.estSellingPrice} onChange={set("estSellingPrice")} /></Field>
        <Field label="Weight (grams)"><Input type="number" min="0" value={v.weightGrams} onChange={set("weightGrams")} /></Field>
        <Field label="Fragile?">
          <Select value={v.isFragile} onChange={set("isFragile")}>
            <option value="">Unknown</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>
      </div>
      <p className="text-[11px] text-faint">Costs and prices entered here are your estimates and are labelled as such. Supplier offers, when added, replace the cost estimate in scoring.</p>
      <FormError error={error} />
      <div className="flex justify-end"><Button type="submit" loading={pending}>{productId ? "Save changes" : "Create product"}</Button></div>
    </form>
  );
}
