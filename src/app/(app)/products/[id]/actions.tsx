"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Bookmark, Eye, Pencil, RefreshCw, ShoppingBag, Trash2 } from "lucide-react";
import type { ProductOverview } from "@/lib/services/products";
import { Button, Select } from "@/components/ui/primitives";
import { ActionButton, Modal, useSubmit } from "@/components/ui/action";
import { CompareToggle } from "@/components/products/compare-tray";
import { ProductForm } from "@/components/products/product-form";
import { STAGES, STAGE_LABELS } from "@/lib/validation/common";

export function ProductActions({ product: p, categories }: { product: ProductOverview; categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { submit, pending, error } = useSubmit();
  return (
    <div className="flex flex-col items-stretch gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2">
        <ActionButton size="sm" variant={p.isBookmarked ? "primary" : "secondary"} endpoint={`/api/products/${p.id}/bookmark`} body={{ value: !p.isBookmarked }}>
          <Bookmark className="h-3.5 w-3.5" /> {p.isBookmarked ? "Bookmarked" : "Bookmark"}
        </ActionButton>
        <ActionButton size="sm" variant={p.onWatchlist ? "primary" : "secondary"} endpoint={p.onWatchlist ? `/api/watchlist/${p.id}` : "/api/watchlist"} method={p.onWatchlist ? "DELETE" : "POST"} body={p.onWatchlist ? {} : { productId: p.id }}>
          <Eye className="h-3.5 w-3.5" /> {p.onWatchlist ? "Watching" : "Watch"}
        </ActionButton>
        <CompareToggle id={p.id} />
        <ActionButton size="sm" variant="secondary" endpoint={`/api/products/${p.id}/score`}><RefreshCw className="h-3.5 w-3.5" /> Rescore</ActionButton>
        <Modal title="Edit product" wide trigger={(open) => <Button size="sm" variant="secondary" onClick={open}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}>
          {(close) => (
            <ProductForm
              productId={p.id}
              categories={categories}
              initial={{ ...p, keywords: p.keywords }}
              onDone={() => {
                close();
                router.refresh();
              }}
            />
          )}
        </Modal>
        <Link href={`/store?tab=listing&productId=${p.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 text-xs font-medium hover:bg-border">
          <ShoppingBag className="h-3.5 w-3.5" /> Create Shopify listing
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Stage"
          className="h-8 w-52 text-xs"
          value={p.stage}
          disabled={pending}
          onChange={async (e) => {
            const reason = window.prompt("Reason for the stage change (optional)") ?? undefined;
            await submit(`/api/products/${p.id}/stage`, { stage: e.target.value, reason: reason || undefined });
          }}
        >
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </Select>
        {p.stage !== "archived" && (
          <ActionButton size="sm" variant="ghost" endpoint={`/api/products/${p.id}/stage`} body={{ stage: "archived", reason: "Archived" }}><Archive className="h-3.5 w-3.5" /> Archive</ActionButton>
        )}
        <ActionButton size="sm" variant="ghost" endpoint={`/api/products/${p.id}`} method="DELETE" confirm={`Permanently delete “${p.name}” and all its research?`} redirectTo="/discover">
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
      {error && <p className="text-[11px] text-bad">{error}</p>}
    </div>
  );
}
