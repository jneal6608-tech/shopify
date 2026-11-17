import "server-only";
import { withService, withUser } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { env } from "../env";
import { ShopifyError, shopifyGraphql, type ShopifyConnection } from "./client";
import { Q } from "./queries";

interface IntegrationRow {
  id: string;
  shopDomain: string;
  authMode: "admin_token" | "client_credentials";
  apiVersion: string;
  status: string;
}
interface CredRow {
  encryptedAccessToken: string | null;
  accessTokenExpiresAt: Date | null;
  clientId: string | null;
  encryptedClientSecret: string | null;
}

/**
 * Dev Dashboard apps (the only option for new custom apps since Jan 2026)
 * exchange client credentials for a short-lived Admin API token.
 */
export async function exchangeClientCredentials(shopDomain: string, clientId: string, clientSecret: string) {
  let res: Response;
  try {
    res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new ShopifyError(`Could not reach ${shopDomain}: ${(e as Error).message}`, "network");
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new ShopifyError(`Token exchange failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}. The client credentials grant only works for an app created by the organization that owns the store and installed on it.`, "auth");
  }
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000 - 60_000), scope: json.scope ?? "" };
}

export async function getIntegration(userId: string): Promise<IntegrationRow | null> {
  const [r] = await withUser(userId, (db) => db<IntegrationRow[]>`select id, shop_domain, auth_mode, api_version, status from public.shopify_integrations limit 1`);
  return r ?? null;
}

/** Builds a connection whose token is decrypted (and refreshed when needed) server-side only. */
export async function getConnection(userId: string): Promise<ShopifyConnection> {
  const integ = await getIntegration(userId);
  if (!integ) throw new ShopifyError("Shopify is not connected. Connect your store in Store Builder.", "not_connected");
  const load = () => withService(async (db) => (await db<CredRow[]>`select encrypted_access_token, access_token_expires_at, client_id, encrypted_client_secret from public.shopify_credentials where integration_id = ${integ.id} and user_id = ${userId}`)[0]);

  const refresh = async (): Promise<string> => {
    const c = await load();
    if (integ.authMode !== "client_credentials" || !c?.clientId || !c.encryptedClientSecret) {
      throw new ShopifyError("Access token rejected and cannot be refreshed. Reconnect the store.", "auth");
    }
    const t = await exchangeClientCredentials(integ.shopDomain, c.clientId, decryptSecret(c.encryptedClientSecret));
    await withService((db) => db`update public.shopify_credentials set encrypted_access_token = ${encryptSecret(t.accessToken)}, access_token_expires_at = ${t.expiresAt}, updated_at = now() where integration_id = ${integ.id}`);
    return t.accessToken;
  };
  return {
    shopDomain: integ.shopDomain,
    apiVersion: integ.apiVersion || env().SHOPIFY_API_VERSION,
    getToken: async () => {
      const c = await load();
      if (!c?.encryptedAccessToken) return refresh();
      if (integ.authMode === "client_credentials" && c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() < Date.now() + 5 * 60_000) return refresh();
      return decryptSecret(c.encryptedAccessToken);
    },
    refreshToken: integ.authMode === "client_credentials" ? refresh : undefined,
  };
}

export async function connectStore(
  userId: string,
  input: { shopDomain: string; authMode: "admin_token" | "client_credentials"; accessToken?: string; clientId?: string; clientSecret?: string },
) {
  const apiVersion = env().SHOPIFY_API_VERSION;
  let accessToken = input.accessToken ?? "";
  let expiresAt: Date | null = null;
  if (input.authMode === "client_credentials") {
    if (!input.clientId || !input.clientSecret) throw new ShopifyError("Client ID and client secret are required.", "user_error");
    const t = await exchangeClientCredentials(input.shopDomain, input.clientId, input.clientSecret);
    accessToken = t.accessToken;
    expiresAt = t.expiresAt;
  } else if (!accessToken) {
    throw new ShopifyError("An Admin API access token is required.", "user_error");
  }
  // Verify before storing anything.
  const conn: ShopifyConnection = { shopDomain: input.shopDomain, apiVersion, getToken: async () => accessToken };
  const info = await shopifyGraphql<{ shop: { name: string; myshopifyDomain: string; currencyCode: string }; currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(conn, Q.shop);
  const scopes = info.currentAppInstallation.accessScopes.map((s) => s.handle);
  const integrationId = await withUser(userId, async (db) => {
    const [r] = await db<{ id: string }[]>`
      insert into public.shopify_integrations (user_id, shop_domain, auth_mode, api_version, status, scopes, shop_name, currency_code, last_checked_at, last_error)
      values (${userId}, ${input.shopDomain}, ${input.authMode}, ${apiVersion}, 'connected', ${scopes}, ${info.shop.name}, ${info.shop.currencyCode}, now(), null)
      on conflict (user_id) do update set shop_domain = excluded.shop_domain, auth_mode = excluded.auth_mode, api_version = excluded.api_version,
        status = 'connected', scopes = excluded.scopes, shop_name = excluded.shop_name, currency_code = excluded.currency_code, last_checked_at = now(), last_error = null
      returning id`;
    return r.id;
  });
  await withService((db) => db`
    insert into public.shopify_credentials (integration_id, user_id, encrypted_access_token, access_token_expires_at, client_id, encrypted_client_secret)
    values (${integrationId}, ${userId}, ${encryptSecret(accessToken)}, ${expiresAt}, ${input.clientId ?? null}, ${input.clientSecret ? encryptSecret(input.clientSecret) : null})
    on conflict (integration_id) do update set encrypted_access_token = excluded.encrypted_access_token, access_token_expires_at = excluded.access_token_expires_at,
      client_id = excluded.client_id, encrypted_client_secret = excluded.encrypted_client_secret, updated_at = now()`);
  return { shopName: info.shop.name, scopes, currency: info.shop.currencyCode };
}

/** Re-checks the connection and records status (shown in Settings/Store Builder). */
export async function checkConnection(userId: string) {
  try {
    const conn = await getConnection(userId);
    const info = await shopifyGraphql<{ shop: { name: string }; currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(conn, Q.shop);
    await withUser(userId, (db) => db`update public.shopify_integrations set status = 'connected', scopes = ${info.currentAppInstallation.accessScopes.map((s) => s.handle)}, last_checked_at = now(), last_error = null`);
    return { ok: true as const, shopName: info.shop.name };
  } catch (e) {
    const msg = (e as Error).message;
    if (!(e instanceof ShopifyError && e.kind === "not_connected")) {
      await withUser(userId, (db) => db`update public.shopify_integrations set status = 'error', last_error = ${msg.slice(0, 1000)}, last_checked_at = now()`);
    }
    return { ok: false as const, error: msg };
  }
}

export async function disconnectStore(userId: string) {
  // Credentials cascade-delete with the integration row.
  await withUser(userId, (db) => db`delete from public.shopify_integrations`);
}
