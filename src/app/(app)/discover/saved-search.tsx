"use client";
import * as React from "react";
import { Button } from "@/components/ui/primitives";
import { useSubmit } from "@/components/ui/action";

export function SaveSearchButton({ filters }: { filters: Record<string, string> }) {
  const { submit, pending, error } = useSubmit();
  if (Object.keys(filters).length === 0) return null;
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11px] text-bad">{error}</span>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={async () => {
          const name = window.prompt("Name this search");
          if (name) await submit("/api/saved-searches", { name, filters });
        }}
      >
        Save search
      </Button>
    </span>
  );
}

export function DeleteSavedSearch({ id }: { id: string }) {
  const { submit } = useSubmit();
  return (
    <button className="text-faint hover:text-bad" aria-label="Delete saved search" onClick={() => submit(`/api/saved-searches/${id}`, {}, { method: "DELETE" })}>
      ×
    </button>
  );
}
