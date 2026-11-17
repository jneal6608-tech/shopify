import "server-only";
import { withService, withUser } from "../db";
import { logger } from "../logger";
import { HANDLERS, type JobKind } from "./handlers";
import { FAILURE_ALERT_AFTER, LOCK_MINUTES, nextRunAt, retryAt, type Frequency } from "./schedule";
import { createAlert } from "../services/alerts";

interface JobRow {
  id: string;
  userId: string;
  kind: JobKind;
  frequency: Frequency;
  config: Record<string, unknown>;
  consecutiveFailures: number;
}

/**
 * Claims due jobs (FOR UPDATE SKIP LOCKED + a lease) so overlapping cron
 * invocations never run the same job twice, then runs them sequentially.
 */
export async function runDueJobs(limit = 5): Promise<Array<{ jobId: string; kind: string; status: string }>> {
  const claimed = await withService((db) => db<JobRow[]>`
    update public.research_jobs j set locked_until = now() + ${`${LOCK_MINUTES} minutes`}::interval
    where j.id in (
      select id from public.research_jobs
      where enabled and frequency <> 'manual' and next_run_at <= now() and (locked_until is null or locked_until < now())
      order by next_run_at limit ${limit} for update skip locked)
    returning id, user_id, kind, frequency, config, consecutive_failures`);
  const out = [];
  for (const job of claimed) out.push({ jobId: job.id, kind: job.kind, status: await executeJob(job, "schedule") });
  return out;
}

/** Runs one job for a user on demand (from the UI). Refuses if it is already running. */
export async function runJobNow(userId: string, kind: JobKind) {
  const [job] = await withUser(userId, (db) => db<JobRow[]>`
    update public.research_jobs set locked_until = now() + ${`${LOCK_MINUTES} minutes`}::interval
    where kind = ${kind} and (locked_until is null or locked_until < now())
    returning id, user_id, kind, frequency, config, consecutive_failures`);
  if (!job) return { status: "busy" as const, message: "This job is already running — try again in a few minutes." };
  const status = await executeJob(job, "manual");
  const [run] = await withUser(userId, (db) => db<{ summary: Record<string, unknown>; error: string | null }[]>`
    select summary, error from public.job_runs where job_id = ${job.id} order by started_at desc limit 1`);
  return { status, summary: run?.summary ?? {}, error: run?.error ?? null };
}

async function executeJob(job: JobRow, trigger: "schedule" | "manual"): Promise<string> {
  const [run] = await withService((db) => db<{ id: string }[]>`
    insert into public.job_runs (user_id, job_id, status, trigger) values (${job.userId}, ${job.id}, 'running', ${trigger}) returning id`);
  const started = Date.now();
  try {
    const handler = HANDLERS[job.kind];
    if (!handler) throw new Error(`Unknown job kind ${job.kind}`);
    const result = await handler(job.userId, job.config ?? {});
    const now = new Date();
    await withService(async (db) => {
      await db`update public.job_runs set status = ${result.status}, finished_at = now(), summary = ${db.json({ ...result.summary, ms: Date.now() - started } as never)} where id = ${run.id}`;
      await db`update public.research_jobs set last_run_at = now(), locked_until = null, consecutive_failures = 0,
        next_run_at = ${trigger === "manual" ? db`next_run_at` : db`${nextRunAt(job.frequency, now)}`} where id = ${job.id}`;
    });
    logger.info("job.done", { kind: job.kind, status: result.status, ms: Date.now() - started });
    return result.status;
  } catch (err) {
    const failures = job.consecutiveFailures + 1;
    const message = (err as Error)?.message?.slice(0, 2000) ?? "Unknown error";
    logger.error("job.failed", { kind: job.kind, jobId: job.id, err });
    await withService(async (db) => {
      await db`update public.job_runs set status = 'failed', finished_at = now(), error = ${message} where id = ${run.id}`;
      await db`update public.research_jobs set locked_until = null, consecutive_failures = ${failures}, next_run_at = ${retryAt(failures, new Date())} where id = ${job.id}`;
    });
    if (failures >= FAILURE_ALERT_AFTER) {
      await withUser(job.userId, (db) =>
        createAlert(db, job.userId, {
          kind: "job_failure",
          severity: "warning",
          title: `Scheduled job “${job.kind.replace(/_/g, " ")}” keeps failing`,
          message: `${failures} consecutive failures. Last error: ${message}`,
          dedupeKey: `job_failure:${job.id}:${failures}`,
        }),
      );
    }
    return "failed";
  }
}
