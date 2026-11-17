import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/auth/supabase-server";

export async function POST(req: Request) {
  const supabase = await supabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
