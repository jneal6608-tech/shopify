import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { aiConfigured } from "@/lib/ai/client";
import { SCOPES } from "@/lib/shopify/queries";
import { KIND_LABELS, type ChangeKind } from "@/lib/shopify/changes";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, TabLinks, Td, Th } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/ui/domain";
import { ActionButton } from "@/components/ui/action";
import { fmtDate, fmtMoney, relTime } from "@/lib/utils";
import { AssistantChat, ChangeActions, ConnectForm, LandingBuilder, LinkProductForm, ListingBuilder, StorefrontGenerator } from "./client";

export const metadata = { title: "Store Builder" };
const TABS = ["connection", "changes", "listing", "landing", "storefront", "assistant", "sales"] as const;

export default async function StorePage({ searchParams }: { searchParams: Promise<{ tab?: string; productId?: string; c?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "connection";
  const d = await withUser(user.id, async (db) => ({
    integ: (await db<Array<{ shopDomain: string; authMode: string; apiVersion: string; status: string; scopes: string[]; shopName: string | null; currencyCode: string | null; lastError: string | null; lastCheckedAt: Date | null; lastSyncedAt: Date | null }>>`select * from public.shopify_integrations limit 1`)[0] ?? null,
    changes: await db<Array<{ id: string; kind: ChangeKind; status: string; title: string; summary: string; payload: Record<string, unknown>; preview: { diff?: Array<{ field: string; before: string | null; after: string }>; error?: string } | null; result: Record<string, unknown> | null; error: string | null; createdBy: string; createdAt: Date; appliedAt: Date | null; rolledBackAt: Date | null }>>`
      select * from public.shopify_change_requests order by created_at desc limit 100`,
    products: await db<Array<{ id: string; name: string; isDemo: boolean; description: string; problemSolved: string; estSellingPrice: number | null; estSupplierCost: number | null; keywords: string[]; imageUrl: string | null }>>`
      select id, name, is_demo, description, problem_solved, est_selling_price, est_supplier_cost, keywords, image_url from public.products where stage <> 'archived' order by updated_at desc limit 200`,
    links: await db<Array<{ id: string; productId: string; productName: string; shopifyProductGid: string; shopifyHandle: string | null; orders: number; revenue: number }>>`
      select l.id, l.product_id, p.name as product_name, l.shopify_product_gid, l.shopify_handle,
        coalesce((select sum(orders)::int from public.sales_performance s where s.product_id = l.product_id and s.source = 'shopify'), 0) as orders,
        coalesce((select sum(revenue) from public.sales_performance s where s.product_id = l.product_id and s.source = 'shopify'), 0) as revenue
      from public.shopify_product_links l join public.products p on p.id = l.product_id order by p.name`,
    conversations: await db<Array<{ id: string; title: string; createdAt: Date }>>`select id, title, created_at from public.ai_conversations order by created_at desc limit 20`,
  }));
  const conversationId = sp.c && d.conversations.some((c) => c.id === sp.c) ? sp.c : d.conversations[0]?.id;
  const messages = conversationId
    ? await withUser(user.id, (db) => db<Array<{ role: "user" | "assistant"; content: { text: string; changeRequests?: Array<{ id: string; title: string }> } }>>`select role, content from public.ai_messages where conversation_id = ${conversationId} order by id`)
    : [];
  const connected = d.integ?.status === "connected";
  const drafts = d.changes.filter((c) => c.status === "draft").length;
  const selected = d.products.find((p) => p.id === sp.productId) ?? null;
  return (
    <>
      <PageHeader title="Store Builder" description="Connect your Shopify store, prepare listings and landing pages from your research, and manage the store with an AI assistant. Nothing is published, priced, deleted or changed in your theme without your explicit approval." />
      <TabLinks
        active={tab}
        tabs={[
          { key: "connection", label: connected ? `Connection · ${d.integ!.shopName}` : "Connection", href: "/store" },
          { key: "changes", label: "Changes", href: "/store?tab=changes", count: drafts },
          { key: "listing", label: "Product listing", href: `/store?tab=listing${selected ? `&productId=${selected.id}` : ""}` },
          { key: "landing", label: "Landing pages", href: `/store?tab=landing${selected ? `&productId=${selected.id}` : ""}` },
          { key: "storefront", label: "Storefront content", href: "/store?tab=storefront" },
          { key: "assistant", label: "Store assistant", href: "/store?tab=assistant" },
          { key: "sales", label: "Sales sync", href: "/store?tab=sales" },
        ]}
      />
      {!connected && tab !== "connection" && <div className="mb-4"><Notice tone="warn">Shopify is not connected. You can still generate content, but previews and applying changes need a connection.</Notice></div>}

      {tab === "connection" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Shopify connection" description={`GraphQL Admin API ${env().SHOPIFY_API_VERSION}`} />
            <CardBody className="space-y-3 text-sm">
              {d.integ ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={connected ? "good" : d.integ.status === "error" ? "bad" : "neutral"}>{d.integ.status}</Badge>
                    <span className="font-medium">{d.integ.shopName ?? d.integ.shopDomain}</span>
                    <span className="text-xs text-faint">{d.integ.shopDomain} · {d.integ.authMode === "client_credentials" ? "Dev Dashboard app (client credentials)" : "Admin API access token"} · checked {relTime(d.integ.lastCheckedAt)}</span>
                  </div>
                  {d.integ.lastError && <Notice tone="bad" title="Last error">{d.integ.lastError}</Notice>}
                  <div className="flex gap-2">
                    <ActionButton size="sm" variant="secondary" endpoint="/api/shopify/check">Check connection</ActionButton>
                    <ActionButton size="sm" variant="danger" endpoint="/api/shopify/connect" method="DELETE" confirm="Disconnect Shopify and delete the stored credentials? Your store is not changed.">Disconnect</ActionButton>
                  </div>
                </>
              ) : (
                <p className="text-muted">Not connected.</p>
              )}
              <ConnectForm encryptionReady={Boolean(env().ENCRYPTION_KEY)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Required access scopes" description="Grant these when configuring your app" />
            <Table>
              <tbody>
                {SCOPES.map((s) => {
                  const has = d.integ?.scopes.includes(s.handle) || (s.alt ? d.integ?.scopes.includes(s.alt) : false);
                  return (
                    <tr key={s.handle}>
                      <Td><code className="text-xs">{s.handle}</code>{s.alt && <span className="text-[11px] text-faint"> or {s.alt}</span>}</Td>
                      <Td className="text-xs text-muted">{s.purpose}</Td>
                      <Td>{d.integ ? <Badge tone={has ? "good" : s.required ? "bad" : "warn"}>{has ? "granted" : "missing"}</Badge> : <Badge>{s.required ? "required" : "optional"}</Badge>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <CardBody className="space-y-2 text-xs text-muted">
              <p><span className="font-medium text-fg">New stores / new apps (since Jan 2026):</span> create an app in the Shopify Dev Dashboard under the organization that owns the store, configure the scopes above, install it on the store, then paste the app's client ID and secret. The platform exchanges them for short-lived tokens and refreshes them automatically.</p>
              <p><span className="font-medium text-fg">Existing legacy custom app:</span> paste its Admin API access token (shpat_…).</p>
              <p>Credentials are encrypted (AES-256-GCM) in a server-only table and never sent to the browser.</p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "changes" && (
        <div className="space-y-4">
          <Notice>Lifecycle: draft (with preview) → you approve → applied (with backup of the previous state) → optional rollback. Products are always created as drafts. Theme changes to your live theme are refused unless you explicitly allow them; work on a duplicated theme instead.</Notice>
          {d.changes.length === 0 && <p className="text-sm text-muted">No change requests yet.</p>}
          {d.changes.map((c) => (
            <Card key={c.id}>
              <CardHeader
                title={<span className="flex flex-wrap items-center gap-2">{c.title}<Badge tone={c.status === "applied" ? "good" : c.status === "failed" ? "bad" : c.status === "draft" ? "warn" : "neutral"}>{c.status}</Badge><Badge>{KIND_LABELS[c.kind]}</Badge>{c.createdBy === "ai" && <Badge tone="accent">proposed by AI</Badge>}</span>}
                description={`Created ${fmtDate(c.createdAt, true)}${c.appliedAt ? ` · applied ${fmtDate(c.appliedAt, true)}` : ""}${c.rolledBackAt ? ` · rolled back ${fmtDate(c.rolledBackAt, true)}` : ""}`}
                action={<ChangeActions id={c.id} status={c.status} kind={c.kind} allowLiveTheme={Boolean(c.payload.allowLiveTheme)} />}
              />
              <CardBody className="space-y-3">
                {c.summary && <p className="text-xs text-muted">{c.summary}</p>}
                {c.preview?.error && <Notice tone="warn">Preview unavailable: {c.preview.error}</Notice>}
                {c.preview?.diff && (
                  <Table>
                    <thead><tr><Th>Field</Th><Th>Current</Th><Th>After</Th></tr></thead>
                    <tbody>{c.preview.diff.map((x, i) => <tr key={i}><Td className="text-xs">{x.field}</Td><Td className="max-w-sm truncate text-xs text-faint">{x.before ?? "—"}</Td><Td className="max-w-sm truncate text-xs">{x.after}</Td></tr>)}</tbody>
                  </Table>
                )}
                {c.error && <Notice tone="bad">{c.error}</Notice>}
                {c.result && <p className="text-xs text-muted">Result: {Object.entries(c.result).map(([k, v]) => k === "adminUrl" ? <a key={k} href={String(v)} target="_blank" rel="noreferrer noopener" className="mr-2 text-accent">Open in Shopify admin</a> : <span key={k} className="mr-2">{k}: {String(v)}</span>)}</p>}
                <details><summary className="cursor-pointer text-xs text-faint">Payload</summary><pre className="mt-2 max-h-80 overflow-auto rounded-md bg-bg p-2 text-[11px] text-muted">{JSON.stringify(c.payload, null, 2)}</pre></details>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === "listing" && <ListingBuilder products={d.products} selectedId={selected?.id ?? null} aiReady={aiConfigured()} />}
      {tab === "landing" && <LandingBuilder products={d.products.map((p) => ({ id: p.id, name: p.name, isDemo: p.isDemo }))} selectedId={selected?.id ?? null} connected={connected} aiReady={aiConfigured()} />}
      {tab === "storefront" && <StorefrontGenerator aiReady={aiConfigured()} />}
      {tab === "assistant" && (
        <div className="grid gap-5 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <CardHeader title="Conversations" action={<Link href="/store?tab=assistant&c=new" className="text-xs text-accent">New</Link>} />
            <CardBody className="space-y-1">
              {d.conversations.map((c) => <Link key={c.id} href={`/store?tab=assistant&c=${c.id}`} className={`block truncate rounded px-2 py-1 text-xs ${c.id === conversationId && sp.c !== "new" ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{c.title}</Link>)}
              {d.conversations.length === 0 && <p className="text-xs text-faint">None yet.</p>}
            </CardBody>
          </Card>
          <div className="lg:col-span-3">
            <AssistantChat conversationId={sp.c === "new" ? null : conversationId ?? null} initial={sp.c === "new" ? [] : messages.map((m) => ({ role: m.role, text: m.content.text, changeRequests: m.content.changeRequests ?? [] }))} aiReady={aiConfigured()} />
          </div>
        </div>
      )}
      {tab === "sales" && (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Research products linked to Shopify" description={`Orders, revenue and refunds sync daily into each product's testing workspace${d.integ?.lastSyncedAt ? ` · last sync ${relTime(d.integ.lastSyncedAt)}` : ""}`} action={<ActionButton size="sm" variant="secondary" endpoint="/api/jobs/run" body={{ kind: "shopify_sync" }} disabled={!connected}>Sync now</ActionButton>} />
            <Table>
              <thead><tr><Th>Research product</Th><Th>Shopify product</Th><Th className="text-right">Orders (synced)</Th><Th className="text-right">Revenue</Th></tr></thead>
              <tbody>
                {d.links.length === 0 && <tr><Td colSpan={4} className="text-center text-xs text-muted">No links yet. Listings created here link automatically; link existing products on the right.</Td></tr>}
                {d.links.map((l) => <tr key={l.id}><Td><Link className="hover:text-accent" href={`/testing/${l.productId}`}>{l.productName}</Link></Td><Td className="text-xs text-muted">{l.shopifyHandle ?? l.shopifyProductGid}</Td><Td className="text-right">{l.orders}</Td><Td className="text-right tabular-nums">{fmtMoney(l.revenue)}</Td></tr>)}
              </tbody>
            </Table>
            <CardBody className="text-[11px] text-faint">Revenue is line-item totals before order-level discounts, shipping and tax. Sessions and conversion rate are not available from the Admin API — enter them from Shopify Analytics in the testing workspace. Orders older than 60 days require the read_all_orders scope.</CardBody>
          </Card>
          <LinkProductForm products={d.products.filter((p) => !p.isDemo).map((p) => ({ id: p.id, name: p.name }))} connected={connected} />
        </div>
      )}
      {selected?.isDemo && (tab === "listing" || tab === "landing") && <div className="mt-4"><DemoBadge /> <span className="text-xs text-muted">Demo product selected — content generated from synthetic data.</span></div>}
    </>
  );
}
