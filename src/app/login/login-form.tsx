"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/primitives";
import { supabaseBrowserClient } from "@/lib/auth/supabase-browser";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = React.useState<"signin" | "signup" | "magic">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "bad" | "good"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const supabase = supabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: "good", text: "Check your email to confirm your account." });
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: "good", text: "Magic link sent — check your email." });
      }
    } catch (err) {
      setMsg({ tone: "bad", text: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {mode !== "magic" && (
        <Field label="Password"><Input type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      )}
      {msg && <p className={msg.tone === "bad" ? "text-xs text-bad" : "text-xs text-good"}>{msg.text}</p>}
      <Button type="submit" className="w-full" loading={pending}>
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send magic link"}
      </Button>
      <div className="flex justify-between text-xs text-muted">
        <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="hover:text-fg">
          {mode === "signup" ? "Have an account? Sign in" : "Create an account"}
        </button>
        <button type="button" onClick={() => setMode(mode === "magic" ? "signin" : "magic")} className="hover:text-fg">
          {mode === "magic" ? "Use password" : "Email me a link"}
        </button>
      </div>
    </form>
  );
}
