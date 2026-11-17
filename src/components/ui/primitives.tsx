import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90 shadow-sm shadow-accent/20",
  secondary: "bg-panel-2 text-fg hover:bg-border border border-border",
  outline: "border border-border-strong text-fg hover:bg-panel-2",
  ghost: "text-muted hover:text-fg hover:bg-panel-2",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-10 px-5 text-sm" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 whitespace-nowrap",
        buttonStyles[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: ButtonVariant; size?: keyof typeof sizes; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap", buttonStyles[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-panel", className)} {...props} />;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent" | "demo";
const tones: Record<Tone, string> = {
  neutral: "bg-panel-2 text-muted border-border",
  good: "bg-good/10 text-good border-good/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  info: "bg-info/10 text-info border-info/25",
  accent: "bg-accent/15 text-accent border-accent/30",
  demo: "bg-demo/15 text-demo border-demo/40",
};
export function Badge({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, "h-9 py-0", className)} {...props} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputClass, "min-h-20", className)} {...props} />;
});
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(inputClass, "h-9 py-0 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-xs text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-good", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-faint whitespace-nowrap", className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("border-b border-border/60 px-3 py-2 align-top", className)}>{children}</td>
);

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "demo" | "good"; title?: string; children: React.ReactNode }) {
  const t = { info: "border-info/30 bg-info/5", warn: "border-warn/30 bg-warn/5", bad: "border-bad/30 bg-bad/5", demo: "border-demo/40 bg-demo/5", good: "border-good/30 bg-good/5" }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-xs text-muted", t)}>
      {title && <p className="mb-0.5 font-semibold text-fg">{title}</p>}
      {children}
    </div>
  );
}

export function TabLinks({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
            t.key === active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-faint">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
