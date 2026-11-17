import { redirect } from "next/navigation";
import { authMode } from "@/lib/env";
import { Card } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mode = authMode();
  if (mode === "local") redirect("/dashboard");
  if (mode === "unconfigured") redirect("/setup");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Dropship Intel</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in to your research workspace.</p>
        <LoginForm />
      </Card>
    </div>
  );
}
