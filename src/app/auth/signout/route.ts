import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/auth/supabase-server";

export async function POST(req: Request) {
  // Same-origin form posts only (prevents cross-site forced sign-out).
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: { message: "Cross-origin request rejected" } }, { status: 403 });
  const supabase = await supabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
