/** Calls a Next.js route handler directly with a Request, as a given test user. */
export async function call(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  opts: { method?: string; url?: string; body?: unknown; params?: Record<string, string>; user: string; headers?: Record<string, string> },
) {
  const req = new Request(opts.url ?? "http://localhost:3000/api/test", {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-test-user-id": opts.user, host: "localhost:3000", ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const json = (await res.json()) as { data?: unknown; error?: { message: string } };
  return { status: res.status, data: json.data as any, error: json.error };
}
