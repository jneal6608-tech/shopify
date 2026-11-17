import { redirect } from "next/navigation";
import { authMode } from "@/lib/env";
import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (authMode() !== "unconfigured") redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-xl p-6 text-sm">
        <h1 className="text-lg font-semibold">Setup required</h1>
        <p className="mt-2 text-muted">Authentication is not configured. Set these server environment variables and restart:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-xs text-muted">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          <li>DATABASE_URL (Supabase pooled connection string)</li>
          <li>ENCRYPTION_KEY, CRON_SECRET</li>
        </ul>
        <p className="mt-3 text-muted">For local development only, set <code className="font-mono">AUTH_MODE=local</code>. See <code className="font-mono">docs/SETUP.md</code>.</p>
      </Card>
    </div>
  );
}
