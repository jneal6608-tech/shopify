/** Pure scheduling helpers (unit-tested). */
export type Frequency = "daily" | "weekly" | "manual";

export function nextRunAt(frequency: Frequency, from: Date): Date | null {
  if (frequency === "manual") return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + (frequency === "daily" ? 1 : 7));
  return d;
}

/** Exponential backoff after failures: 30 min, 1 h, 2 h … capped at 24 h. */
export function retryAt(consecutiveFailures: number, from: Date): Date {
  const minutes = Math.min(24 * 60, 30 * 2 ** Math.max(0, consecutiveFailures - 1));
  return new Date(from.getTime() + minutes * 60_000);
}

export const LOCK_MINUTES = 15;
export const FAILURE_ALERT_AFTER = 3;
