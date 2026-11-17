import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed on access (not at import) so missing optional
 * integrations never crash the app — they surface as "not configured"
 * statuses in Settings instead.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["supabase", "local"]).optional(),
  LOCAL_DEV_USER_ID: z.string().uuid().default("00000000-0000-4000-8000-000000000001"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex chars (32 bytes)").optional(),
  CRON_SECRET: z.string().min(16).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SERPAPI_API_KEY: z.string().min(1).optional(),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  META_AD_LIBRARY_ACCESS_TOKEN: z.string().min(1).optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  META_AD_REACHED_COUNTRIES: z.string().default("DE,FR,IT,ES,NL,IE"),
  SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-\d{2}$/).default("2026-10"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});

export type ServerEnv = z.infer<typeof schema>;

export function env(): ServerEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return parsed.data;
}

export type AuthMode = "supabase" | "local" | "unconfigured";

export function authMode(): AuthMode {
  const e = env();
  if (e.AUTH_MODE === "local") {
    // Local dev auth is a development convenience and is refused in production.
    if (e.NODE_ENV === "production") throw new Error("AUTH_MODE=local is not allowed in production");
    return "local";
  }
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY) return "supabase";
  return "unconfigured";
}
