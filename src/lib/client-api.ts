"use client";

/** Thin fetch wrapper for the app's JSON API. Throws Error(message) on failure. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: { data?: T; error?: { message: string; details?: Array<{ path: string; message: string }> | string | null } } = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const d = json.error?.details;
    const detail = Array.isArray(d) ? d.map((x) => `${x.path ? x.path + ": " : ""}${x.message}`).join("; ") : typeof d === "string" ? d : "";
    throw new Error([json.error?.message ?? `Request failed (${res.status})`, detail].filter(Boolean).join(" — "));
  }
  return json.data as T;
}
