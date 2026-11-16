/** Small numeric helpers shared by the deterministic analytics modules. */

export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stddev(values: number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/** Least-squares slope of y over x = 0..n-1. */
export function slope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const xm = (n - 1) / 2;
  const ym = mean(values)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (values[i] - ym);
    den += (i - xm) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const am = mean(a)!;
  const bm = mean(b)!;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - am) * (b[i] - bm);
    da += (a[i] - am) ** 2;
    db += (b[i] - bm) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/**
 * Piecewise-linear interpolation through (x, y) breakpoints sorted by x.
 * Values outside the range are clamped to the first/last y.
 */
export function piecewise(x: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (points.length === 0) throw new Error("piecewise: no points");
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

export const DAY_MS = 86_400_000;

export function daysBetween(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}
