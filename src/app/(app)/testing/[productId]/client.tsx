"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Modal, useSubmit, FormError } from "@/components/ui/action";
import { RecordForm, type FieldDef } from "@/components/ui/record-form";
import { FACELESS_FORMATS } from "@/lib/analytics/rubrics";
import { cn } from "@/lib/utils";

const PIPELINE = ["discovered", "researching", "selected_for_testing", "sample_ordered", "sample_received", "content_production", "testing", "promising", "scaling_consideration"];

export function StageStepper({ productId, current, stages }: { productId: string; current: string; stages: Array<{ key: string; label: string }> }) {
  const { submit, pending, error } = useSubmit();
  const idx = PIPELINE.indexOf(current);
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {stages.map((s) => {
          const i = PIPELINE.indexOf(s.key);
          const done = i >= 0 && idx >= 0 && i < idx;
          return (
            <button
              key={s.key}
              disabled={pending || s.key === current}
              onClick={() => {
                const reason = window.prompt(`Move to “${s.label}”? Optional reason:`);
                if (reason !== null) submit(`/api/products/${productId}/stage`, { stage: s.key, reason: reason || undefined });
              }}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                s.key === current ? "border-accent bg-accent/20 text-fg" : done ? "border-good/30 text-good/80" : s.key === "discontinued" || s.key === "archived" ? "border-border text-faint hover:text-bad" : "border-border text-muted hover:text-fg",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <FormError error={error} />
    </div>
  );
}

export function ProjectForm({ productId, initial }: { productId: string; initial: { budgetUsd: number | null; hoursPerWeek: number | null; hypothesis: string; successCriteria: string; sampleCost: number | null } | null }) {
  const fields: FieldDef[] = [
    { name: "budgetUsd", label: "Test budget ($)", type: "number", step: "0.01" },
    { name: "sampleCost", label: "Sample cost ($)", type: "number", step: "0.01" },
    { name: "hoursPerWeek", label: "Hours / week", type: "number", step: "0.5" },
    { name: "hypothesis", label: "Hypothesis", type: "textarea" },
    { name: "successCriteria", label: "Success criteria", type: "textarea", hint: "e.g. ≥5 orders from ≥150 sessions within 14 days" },
  ];
  const router = useRouter();
  return (
    <Card>
      <CardHeader title="Test plan" />
      <CardBody><RecordForm fields={fields} endpoint={`/api/testing/${productId}`} method="PATCH" initial={initial ?? {}} submitLabel="Save plan" onDone={() => router.refresh()} /></CardBody>
    </Card>
  );
}

function ModalForm({ title, label, fields, endpoint, small }: { title: string; label: string; fields: FieldDef[]; endpoint: string; small?: boolean }) {
  const router = useRouter();
  return (
    <Modal title={title} wide trigger={(open) => <Button size="sm" variant={small ? "ghost" : "secondary"} onClick={open}>{!small && <Plus className="h-3.5 w-3.5" />}{label}</Button>}>
      {(close) => <RecordForm fields={fields} endpoint={endpoint} onDone={() => { close(); router.refresh(); }} />}
    </Modal>
  );
}

const formatOptions = FACELESS_FORMATS.map((f) => ({ value: f.key, label: f.label }));

export function AddCampaign({ productId }: { productId: string }) {
  return (
    <ModalForm title="New content campaign" label="Campaign" endpoint={`/api/products/${productId}/campaigns`} fields={[
      { name: "name", label: "Name", type: "text", required: true },
      { name: "platform", label: "Platform", type: "select", options: [{ value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }, { value: "youtube", label: "YouTube" }, { value: "multi", label: "Multi-platform" }] },
      { name: "format", label: "Primary format", type: "select", options: formatOptions },
      { name: "status", label: "Status", type: "select", options: ["planned", "producing", "published", "paused", "done"].map((s) => ({ value: s, label: s })) },
      { name: "shopifyUtmCampaign", label: "utm_campaign tag (links store sales to this campaign)", type: "text" },
      { name: "angle", label: "Angle", type: "textarea" },
    ]} />
  );
}

export function AddVideo({ productId, campaigns }: { productId: string; campaigns: Array<{ id: string; name: string }> }) {
  return (
    <ModalForm title="Record a published video" label="Video" endpoint={`/api/products/${productId}/videos`} fields={[
      { name: "platform", label: "Platform", type: "select", options: [{ value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram Reels" }, { value: "youtube", label: "YouTube Shorts" }] },
      { name: "campaignId", label: "Campaign", type: "select", options: [{ value: "", label: "— none —" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))] },
      { name: "url", label: "Video URL", type: "url" },
      { name: "publishedAt", label: "Published on", type: "date" },
      { name: "title", label: "Title / label", type: "text" },
      { name: "format", label: "Format", type: "select", options: formatOptions },
      { name: "durationSec", label: "Duration (s)", type: "number", step: "1" },
      { name: "hook", label: "Opening hook used", type: "textarea" },
    ]} />
  );
}

export function AddSnapshot({ videoId }: { videoId: string }) {
  return (
    <ModalForm small title="Record metrics snapshot (cumulative totals from the platform)" label="+ metrics" endpoint={`/api/videos/${videoId}/performance`} fields={[
      { name: "capturedAt", label: "Checked on", type: "date" },
      { name: "views", label: "Views", type: "number", step: "1" },
      { name: "likes", label: "Likes", type: "number", step: "1" },
      { name: "comments", label: "Comments", type: "number", step: "1" },
      { name: "shares", label: "Shares", type: "number", step: "1" },
      { name: "saves", label: "Saves", type: "number", step: "1" },
      { name: "profileVisits", label: "Profile visits", type: "number", step: "1" },
      { name: "linkClicks", label: "Link clicks (bio/link-in-bio analytics)", type: "number", step: "1" },
    ]} />
  );
}

export function AddSales({ productId }: { productId: string }) {
  return (
    <ModalForm title="Record store performance for a period" label="Sales period" endpoint={`/api/products/${productId}/sales`} fields={[
      { name: "periodStart", label: "From", type: "date" },
      { name: "periodEnd", label: "To", type: "date" },
      { name: "sessions", label: "Sessions (Shopify Analytics)", type: "number", step: "1" },
      { name: "addToCarts", label: "Add-to-carts", type: "number", step: "1" },
      { name: "orders", label: "Orders", type: "number", step: "1" },
      { name: "units", label: "Units", type: "number", step: "1" },
      { name: "revenue", label: "Revenue ($)", type: "number", step: "0.01" },
      { name: "refundCount", label: "Refunded orders", type: "number", step: "1" },
      { name: "refundsAmount", label: "Refunded amount ($)", type: "number", step: "0.01" },
      { name: "adSpend", label: "Paid spend, if any ($)", type: "number", step: "0.01" },
    ]} />
  );
}
