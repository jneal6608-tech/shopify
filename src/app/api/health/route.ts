import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authMode } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Deployment check (no secrets): database reachable, server role can switch to
 * `authenticated` (required for RLS), RLS enabled on core tables.
 */
export async function GET() {
  const out: Record<string, unknown> = { auth: "unknown", database: false, rlsRoleSwitch: false, rlsEnabled: false };
  try {
    out.auth = authMode();
  } catch (e) {
    out.auth = (e as Error).message;
  }
  try {
    const sql = getSql();
    await sql`select 1`;
    out.database = true;
    await sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      const [r] = await tx<{ role: string }[]>`select current_user as role`;
      out.rlsRoleSwitch = r.role === "authenticated";
    });
    const [rls] = await sql<{ n: number }[]>`select count(*)::int as n from pg_class where relname in ('products','trend_observations','shopify_credentials') and relrowsecurity`;
    out.rlsEnabled = rls.n === 3;
  } catch (err) {
    logger.error("health.failed", { err });
  }
  const ok = out.database === true && out.rlsRoleSwitch === true && out.rlsEnabled === true && out.auth !== "unconfigured";
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 503 });
}
