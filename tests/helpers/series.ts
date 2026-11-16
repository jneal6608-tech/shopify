import type { SeriesPoint } from "@/lib/analytics/trends";

/** Weekly series ending at `end`, values produced by fn(index). */
export function weekly(n: number, fn: (i: number) => number, end = new Date("2026-11-15T00:00:00Z")): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(end.getTime() - (n - 1 - i) * 7 * 86_400_000).toISOString(),
    value: fn(i),
  }));
}
