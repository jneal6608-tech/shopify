import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DatabaseNotConfiguredError, withUser, type Db } from "../db";
import { getSessionUser, type SessionUser } from "../auth/session";
import { logger } from "../logger";
import { HttpError } from "./errors";
import { enforceRateLimit } from "./rate-limit";
import { AiUnavailableError } from "../ai/errors";
import { ShopifyError } from "../shopify/client";

export interface HandlerContext<B, Q> {
  req: Request;
  user: SessionUser;
  db: Db;
  body: B;
  query: Q;
  params: Record<string, string>;
}

interface Options<B, Q> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  rateLimit?: { bucket: string; limit: number; windowSec: number };
  /** Run without the RLS transaction (handler manages its own DB access). */
  noTransaction?: boolean;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wraps a route handler with: authentication, same-origin check for
 * mutations, rate limiting, Zod validation of body/query, an RLS-scoped
 * transaction, and uniform JSON error responses.
 */
export function apiHandler<B = undefined, Q = undefined>(
  opts: Options<B, Q>,
  fn: (ctx: HandlerContext<B, Q>) => Promise<unknown>,
) {
  return async (req: Request, routeCtx?: { params?: Promise<Record<string, string>> }) => {
    const started = Date.now();
    try {
      if (MUTATING.has(req.method)) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected");
      }
      const user = await getSessionUser(req);
      if (!user) throw new HttpError(401, "Not signed in");
      if (opts.rateLimit) {
        await enforceRateLimit(`${opts.rateLimit.bucket}:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      let body = undefined as B;
      if (opts.body) {
        let json: unknown = {};
        const text = await req.text();
        if (text.length > 1_000_000) throw new HttpError(413, "Request body too large");
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            throw new HttpError(400, "Invalid JSON body");
          }
        }
        body = opts.body.parse(json);
      }
      let query = undefined as Q;
      if (opts.query) {
        const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
        query = opts.query.parse(sp);
      }
      const params = (await routeCtx?.params) ?? {};
      const run = (db: Db) => fn({ req, user, db, body, query, params });
      const result = opts.noTransaction ? await run(undefined as unknown as Db) : await withUser(user.id, run);
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err, req, started);
    }
  };
}

export function errorResponse(err: unknown, req: Request, started = Date.now()) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { message: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: { message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  if (err instanceof AiUnavailableError) {
    return NextResponse.json({ error: { message: err.message, code: err.code } }, { status: 503 });
  }
  if (err instanceof ShopifyError) {
    const status = { user_error: 400, permission: 403, not_connected: 409, auth: 409, throttled: 429, graphql: 502, network: 502 }[err.kind];
    return NextResponse.json({ error: { message: err.message, code: `shopify_${err.kind}` } }, { status });
  }
  if (err instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: { message: err.message } }, { status: 503 });
  }
  const pg = err as { code?: string; message?: string };
  if (pg?.code === "23505") return NextResponse.json({ error: { message: "That record already exists." } }, { status: 409 });
  if (pg?.code === "23503") return NextResponse.json({ error: { message: "Referenced record not found." } }, { status: 400 });
  if (pg?.code === "23514" || pg?.code === "22P02")
    return NextResponse.json({ error: { message: "Invalid value", details: pg.message } }, { status: 400 });
  if (pg?.code === "42501") return NextResponse.json({ error: { message: "Not permitted" } }, { status: 403 });
  logger.error("api.unhandled", { path: new URL(req.url).pathname, method: req.method, ms: Date.now() - started, err });
  return NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 });
}
