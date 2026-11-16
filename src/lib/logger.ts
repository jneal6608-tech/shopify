/** Minimal structured logger with secret redaction (JSON lines to stdout). */
const SECRET_KEY = /(token|secret|password|authorization|api[_-]?key|cookie)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    if (value instanceof Error) return { name: value.name, message: value.message };
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  if (typeof value === "string" && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

type Level = "debug" | "info" | "warn" | "error";
function log(level: Level, msg: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(data ? (redact(data) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, d?: Record<string, unknown>) => log("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => log("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => log("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => log("error", m, d),
};
export { redact };
