"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "./primitives";
import { api } from "@/lib/client-api";

/** Triggers an AI feature; shows the model used and the metered cost. */
export function AiButton({ endpoint, body, children, onDone, ...props }: Omit<ButtonProps, "onClick"> & { endpoint: string; body?: unknown; onDone?: (d: unknown) => void }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        loading={pending}
        onClick={async () => {
          setPending(true);
          setMsg(null);
          try {
            const d = await api<{ meta?: { model: string; costUsd: number } }>(endpoint, { method: "POST", body: body ?? {} });
            if (d?.meta) setMsg({ tone: "ok", text: `Done · ${d.meta.model} · ~$${d.meta.costUsd.toFixed(3)}` });
            onDone?.(d);
            router.refresh();
          } catch (e) {
            setMsg({ tone: "bad", text: (e as Error).message });
          } finally {
            setPending(false);
          }
        }}
      >
        {!pending && <Sparkles className="h-3.5 w-3.5" />}
        {pending ? "Working… (can take a minute)" : children}
      </Button>
      {msg && <span className={`max-w-sm text-[11px] ${msg.tone === "bad" ? "text-bad" : "text-faint"}`}>{msg.text}</span>}
    </span>
  );
}
