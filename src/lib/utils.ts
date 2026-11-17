import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtMoney(v: number | null | undefined, currency = "USD") {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

export function fmtNum(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = false) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = `${v.toFixed(digits)}%`;
  return signed && v > 0 ? `+${s}` : s;
}

export function fmtDate(v: Date | string | null | undefined, withTime = false) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString("en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function relTime(v: Date | string | null | undefined) {
  if (!v) return "never";
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.round(diff / 60000);
  if (Math.abs(m) < 1) return "just now";
  if (Math.abs(m) < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
