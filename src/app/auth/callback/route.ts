import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/auth/supabase-server";

/** Exchanges an email-confirmation / magic-link code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
