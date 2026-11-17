"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "./primitives";
import { api } from "@/lib/client-api";

/** Button that calls an API endpoint, shows errors, and refreshes server data. */
export function ActionButton({
  endpoint,
  method = "POST",
  body,
  confirm,
  onDone,
  redirectTo,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  endpoint: string;
  method?: string;
  body?: unknown;
  confirm?: string;
  onDone?: (data: unknown) => void;
  redirectTo?: string | ((data: unknown) => string);
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        loading={pending}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setPending(true);
          setError(null);
          try {
            const data = await api(endpoint, { method, body: body ?? {} });
            onDone?.(data);
            if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(data) : redirectTo);
            else router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {children}
      </Button>
      {error && <span className="max-w-xs text-[11px] text-bad">{error}</span>}
    </span>
  );
}

export function useSubmit<T = unknown>() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = React.useCallback(
    async (path: string, body: unknown, opts: { method?: string; refresh?: boolean } = {}) => {
      setPending(true);
      setError(null);
      try {
        const data = await api<T>(path, { method: opts.method ?? "POST", body });
        if (opts.refresh !== false) router.refresh();
        return data;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { submit, pending, error, setError };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</p>;
}

/** Native <dialog>-based modal. */
export function Modal({ trigger, title, children, wide }: { trigger: (open: () => void) => React.ReactNode; title: string; children: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const [open, setOpen] = React.useState(false);
  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      {trigger(show)}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-border bg-panel p-0 text-fg backdrop:bg-black/70`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={close} className="text-muted hover:text-fg" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 scrollbar-thin">{open && children(close)}</div>
      </dialog>
    </>
  );
}
