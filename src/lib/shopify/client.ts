import "server-only";
import { logger } from "../logger";

export class ShopifyError extends Error {
  constructor(
    message: string,
    public kind: "auth" | "throttled" | "user_error" | "graphql" | "network" | "not_connected" | "permission",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

export interface ShopifyConnection {
  shopDomain: string;
  apiVersion: string;
  getToken: () => Promise<string>;
  /** Called once when a 401 is received, to refresh short-lived tokens. */
  refreshToken?: () => Promise<string>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
}

export function normalizeShopDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const full = d.endsWith(".myshopify.com") ? d : `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(full)) throw new ShopifyError("Enter your store's myshopify.com domain (e.g. my-store.myshopify.com).", "user_error");
  return full;
}

/**
 * Shopify GraphQL Admin API request with: auth error mapping (+ one token
 * refresh), 429 / THROTTLED retries using the cost-based throttle status,
 * timeouts, and GraphQL error surfacing. Access tokens never leave the server.
 */
export async function shopifyGraphql<T>(conn: ShopifyConnection, query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  const url = `https://${conn.shopDomain}/admin/api/${conn.apiVersion}/graphql.json`;
  let token = await conn.getToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (attempt < 2) return shopifyGraphql(conn, query, variables, attempt + 1);
    throw new ShopifyError(`Could not reach Shopify: ${(e as Error).message}`, "network");
  }
  if (res.status === 401) {
    if (conn.refreshToken && attempt === 0) {
      token = await conn.refreshToken();
      return shopifyGraphql({ ...conn, getToken: async () => token, refreshToken: undefined }, query, variables, attempt + 1);
    }
    throw new ShopifyError("Shopify rejected the access token (expired or revoked). Reconnect the store in Store Builder → Connection.", "auth");
  }
  if (res.status === 403) throw new ShopifyError("The app lacks the required Shopify access scope for this action.", "permission");
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      const ra = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(ra, 10) * 1000));
      return shopifyGraphql(conn, query, variables, attempt + 1);
    }
    throw new ShopifyError(`Shopify is unavailable or throttling (HTTP ${res.status}).`, res.status === 429 ? "throttled" : "network");
  }
  const json = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
  if (json.errors?.length) {
    const throttled = json.errors.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < 3) {
      const t = json.extensions?.cost;
      const need = t?.requestedQueryCost ?? 100;
      const avail = t?.throttleStatus?.currentlyAvailable ?? 0;
      const rate = t?.throttleStatus?.restoreRate ?? 50;
      const waitMs = Math.max(1000, Math.ceil(((need - avail) / rate) * 1000));
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 15_000)));
      return shopifyGraphql(conn, query, variables, attempt + 1);
    }
    const denied = json.errors.some((e) => e.extensions?.code === "ACCESS_DENIED");
    logger.warn("shopify.graphql_errors", { errors: json.errors.slice(0, 5) });
    throw new ShopifyError(json.errors.map((e) => e.message).join("; "), denied ? "permission" : "graphql", json.errors);
  }
  if (!json.data) throw new ShopifyError("Empty response from Shopify", "graphql");
  return json.data;
}

/** Throws if a mutation payload reports userErrors. */
export function assertNoUserErrors(payload: { userErrors?: Array<{ field?: string[] | null; message: string }> } | null | undefined, action: string) {
  if (!payload) throw new ShopifyError(`${action}: no payload returned`, "graphql");
  const errs = payload.userErrors ?? [];
  if (errs.length) throw new ShopifyError(`${action}: ${errs.map((e) => (e.field?.length ? `${e.field.join(".")}: ` : "") + e.message).join("; ")}`, "user_error", errs);
}
