"use client";
import { JsonView } from "@/components/reports/json-view";
export function JsonViewClient({ value }: { value: unknown }) {
  return <>{JsonView({ value })}</>;
}
