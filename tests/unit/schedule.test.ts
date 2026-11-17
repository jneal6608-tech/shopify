import { describe, expect, it } from "vitest";
import { nextRunAt, retryAt } from "@/lib/jobs/schedule";

describe("job scheduling", () => {
  const t = new Date("2026-11-16T12:00:00Z");
  it("computes next runs", () => {
    expect(nextRunAt("daily", t)?.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(nextRunAt("weekly", t)?.toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(nextRunAt("manual", t)).toBeNull();
  });
  it("backs off exponentially and caps at 24h", () => {
    expect(retryAt(1, t).getTime() - t.getTime()).toBe(30 * 60_000);
    expect(retryAt(2, t).getTime() - t.getTime()).toBe(60 * 60_000);
    expect(retryAt(20, t).getTime() - t.getTime()).toBe(24 * 60 * 60_000);
  });
});
