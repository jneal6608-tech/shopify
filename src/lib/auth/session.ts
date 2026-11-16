import "server-only";
import { redirect } from "next/navigation";
import { authMode, env } from "../env";
import { withService } from "../db";
import { bootstrapUser } from "../services/bootstrap";
import { supabaseServerClient } from "./supabase-server";

export interface SessionUser {
  id: string;
  email: string | null;
  mode: "supabase" | "local";
}

const bootstrapped = new Set<string>();

async function ensureBootstrapped(user: SessionUser) {
  if (bootstrapped.has(user.id)) return;
  if (user.mode === "local") {
    // Local shim only: make sure the dev user exists in auth.users.
    await withService(async (db) => {
      await db`insert into auth.users (id, email) values (${user.id}, ${user.email}) on conflict (id) do nothing`;
    });
  }
  await bootstrapUser(user.id, user.email);
  bootstrapped.add(user.id);
}

/**
 * Resolve the signed-in user. In Supabase mode the session is verified with
 * the Auth server (`getUser`, not just the cookie). In local dev mode a fixed
 * development user is used; tests may select a user via `x-test-user-id`.
 */
export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  const mode = authMode();
  if (mode === "unconfigured") return null;
  let user: SessionUser | null = null;
  if (mode === "local") {
    const testHeader = env().NODE_ENV === "test" ? req?.headers.get("x-test-user-id") : null;
    user = { id: testHeader || env().LOCAL_DEV_USER_ID, email: "dev@localhost", mode: "local" };
  } else {
    const supabase = await supabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    user = { id: data.user.id, email: data.user.email ?? null, mode: "supabase" };
  }
  await ensureBootstrapped(user);
  return user;
}

/** For pages: redirect to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const mode = authMode();
  if (mode === "unconfigured") redirect("/setup");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
