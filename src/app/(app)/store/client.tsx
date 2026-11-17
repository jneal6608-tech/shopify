"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui/primitives";
import { FormError, useSubmit } from "@/components/ui/action";
import { api } from "@/lib/client-api";
import { JsonViewClient } from "./json-client";
import type { LandingPage, Listing } from "@/lib/ai/schemas";

// ---------------------------------------------------------------- Connection
export function ConnectForm({ encryptionReady }: { encryptionReady: boolean }) {
  const { submit, pending, error } = useSubmit<{ shopName: string; scopes: string[] }>();
  const [mode, setMode] = React.useState<"client_credentials" | "admin_token">("client_credentials");
  const [v, setV] = React.useState({ shopDomain: "", clientId: "", clientSecret: "", accessToken: "" });
  const [ok, setOk] = React.useState<string | null>(null);
  if (!encryptionReady) return <Notice tone="warn">Set ENCRYPTION_KEY (64 hex characters) on the server before connecting a store.</Notice>;
  return (
    <form
      className="space-y-3 border-t border-border pt-3"
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = mode === "admin_token" ? { authMode: mode, shopDomain: v.shopDomain, accessToken: v.accessToken } : { authMode: mode, shopDomain: v.shopDomain, clientId: v.clientId, clientSecret: v.clientSecret };
        const r = await submit("/api/shopify/connect", body);
        if (r) {
          setOk(`Connected to ${r.shopName}. Granted scopes: ${r.scopes.join(", ") || "none"}.`);
          setV({ shopDomain: v.shopDomain, clientId: "", clientSecret: "", accessToken: "" });
        }
      }}
    >
      <Field label="Store domain"><Input required placeholder="my-store.myshopify.com" value={v.shopDomain} onChange={(e) => setV({ ...v, shopDomain: e.target.value })} /></Field>
      <Field label="Connection type">
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="client_credentials">Dev Dashboard app — client ID + secret (new apps)</option>
          <option value="admin_token">Legacy custom app — Admin API access token</option>
        </Select>
      </Field>
      {mode === "client_credentials" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client ID"><Input required value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })} /></Field>
          <Field label="Client secret"><Input required type="password" value={v.clientSecret} onChange={(e) => setV({ ...v, clientSecret: e.target.value })} /></Field>
        </div>
      ) : (
        <Field label="Admin API access token"><Input required type="password" value={v.accessToken} onChange={(e) => setV({ ...v, accessToken: e.target.value })} /></Field>
      )}
      <FormError error={error} />
      {ok && <p className="text-xs text-good">{ok}</p>}
      <Button type="submit" loading={pending}>Verify & connect</Button>
    </form>
  );
}

// ---------------------------------------------------------------- Changes
export function ChangeActions({ id, status, kind, allowLiveTheme }: { id: string; status: string; kind: string; allowLiveTheme: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const run = async (path: string, body: unknown, question?: string) => {
    if (question && !window.confirm(question)) return;
    setPending(true);
    setErr(null);
    try {
      await api(path, { method: "POST", body });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const themeKind = kind === "theme_files_upsert" || kind === "landing_page";
  return (
    <div className="flex max-w-xs flex-col items-end gap-1.5">
      {status === "draft" && (
        <>
          <label className="flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I reviewed the preview and approve this change</label>
          {themeKind && allowLiveTheme && <label className="flex items-center gap-1.5 text-[11px] text-warn"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> I understand this may modify my LIVE theme</label>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(`/api/shopify/changes/${id}/cancel`, {})}>Cancel</Button>
            <Button size="sm" loading={pending} disabled={!confirmed} onClick={() => run(`/api/shopify/changes/${id}/apply`, { confirmed: true, confirmLiveTheme: live }, "Apply this change to your Shopify store now?")}>Apply to store</Button>
          </div>
        </>
      )}
      {status === "applied" && <Button size="sm" variant="danger" loading={pending} onClick={() => run(`/api/shopify/changes/${id}/rollback`, { confirmed: true }, "Roll back this change using the stored backup?")}>Roll back</Button>}
      {status === "failed" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(`/api/shopify/changes/${id}/cancel`, {})}>Dismiss</Button>}
      {err && <p className="text-right text-[11px] text-bad">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Listing
type P = { id: string; name: string; isDemo: boolean; description: string; problemSolved: string; estSellingPrice: number | null; estSupplierCost: number | null; keywords: string[]; imageUrl: string | null };
export function ListingBuilder({ products, selectedId, aiReady }: { products: P[]; selectedId: string | null; aiReady: boolean }) {
  const router = useRouter();
  const product = products.find((p) => p.id === selectedId) ?? null;
  const blank = (p: P | null) => ({
    title: p?.name.replace("[DEMO] ", "") ?? "", descriptionHtml: p ? `<p>${p.description}</p>` : "", productType: "", tags: (p?.keywords ?? []).join(", "),
    seoTitle: "", seoDescription: "", price: p?.estSellingPrice?.toString() ?? "", compareAtPrice: "", cost: p?.estSupplierCost?.toString() ?? "",
    optionName: "", optionValues: "", images: p?.imageUrl ?? "",
  });
  const [v, setV] = React.useState(() => blank(product));
  const [extra, setExtra] = React.useState<Pick<Listing, "features" | "benefits" | "faqs" | "imageSuggestions" | "claimsToVerify"> | null>(null);
  const [gen, setGen] = React.useState<{ pending: boolean; err: string | null; meta?: string }>({ pending: false, err: null });
  const { submit, pending, error } = useSubmit<{ id: string; previewError: string | null }>();
  const [created, setCreated] = React.useState<string | null>(null);
  React.useEffect(() => setV(blank(product)), [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Create Shopify product listing"
          description="Review and edit everything. Creating the change request does not touch your store; applying it creates the product as a DRAFT."
          action={
            <Select className="h-8 w-60 text-xs" value={selectedId ?? ""} onChange={(e) => router.push(`/store?tab=listing&productId=${e.target.value}`)}>
              <option value="">Choose research product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          }
        />
        <CardBody className="space-y-3">
          {product && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" disabled={!aiReady} loading={gen.pending} onClick={async () => {
                setGen({ pending: true, err: null });
                try {
                  const r = await api<{ data: Listing; meta: { model: string; costUsd: number } }>("/api/shopify/ai/listing", { method: "POST", body: { productId: product.id } });
                  const l = r.data;
                  setV({ ...v, title: l.title, descriptionHtml: l.descriptionHtml, productType: l.productType, tags: l.tags.join(", "), seoTitle: l.seoTitle, seoDescription: l.seoDescription });
                  setExtra({ features: l.features, benefits: l.benefits, faqs: l.faqs, imageSuggestions: l.imageSuggestions, claimsToVerify: l.claimsToVerify });
                  setGen({ pending: false, err: null, meta: `${r.meta.model} · ~$${r.meta.costUsd.toFixed(3)}` });
                } catch (e) {
                  setGen({ pending: false, err: (e as Error).message });
                }
              }}>Generate listing copy with AI</Button>
              {!aiReady && <span className="text-[11px] text-faint">AI not configured — fill the fields manually.</span>}
              {gen.meta && <span className="text-[11px] text-faint">{gen.meta}</span>}
              {gen.err && <span className="text-[11px] text-bad">{gen.err}</span>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2"><Input maxLength={255} value={v.title} onChange={set("title")} /></Field>
            <Field label="Description (HTML)" className="sm:col-span-2"><Textarea className="min-h-40 font-mono text-xs" value={v.descriptionHtml} onChange={set("descriptionHtml")} /></Field>
            <Field label="Product type"><Input value={v.productType} onChange={set("productType")} /></Field>
            <Field label="Tags (comma separated)"><Input value={v.tags} onChange={set("tags")} /></Field>
            <Field label="SEO title" hint={`${v.seoTitle.length}/70`}><Input maxLength={70} value={v.seoTitle} onChange={set("seoTitle")} /></Field>
            <Field label="SEO description" hint={`${v.seoDescription.length}/320`}><Input maxLength={320} value={v.seoDescription} onChange={set("seoDescription")} /></Field>
            <Field label="Price ($)"><Input type="number" step="0.01" min="0" value={v.price} onChange={set("price")} /></Field>
            <Field label="Compare-at price ($)" hint="Only if you genuinely sold at this price"><Input type="number" step="0.01" min="0" value={v.compareAtPrice} onChange={set("compareAtPrice")} /></Field>
            <Field label="Cost per item ($)" hint="Stored on the inventory item (not shown to customers)"><Input type="number" step="0.01" min="0" value={v.cost} onChange={set("cost")} /></Field>
            <Field label="Variant option name (optional)"><Input placeholder="e.g. Color" value={v.optionName} onChange={set("optionName")} /></Field>
            <Field label="Variant values (comma separated)" className="sm:col-span-2"><Input placeholder="e.g. Grey, Blue" value={v.optionValues} onChange={set("optionValues")} /></Field>
            <Field label="Image URLs (https, one per line)" className="sm:col-span-2"><Textarea value={v.images} onChange={set("images")} /></Field>
          </div>
          <p className="text-[11px] text-faint">Inventory: variants are created untracked (typical for dropshipping). Configure inventory and fulfilment locations in Shopify.</p>
          <FormError error={error} />
          {created && <Notice tone="good">Draft change request created. <Link className="text-accent" href="/store?tab=changes">Review and approve it →</Link></Notice>}
          <Button disabled={!v.title || !v.price} loading={pending} onClick={async () => {
            const values = v.optionValues.split(",").map((s) => s.trim()).filter(Boolean);
            const r = await submit("/api/shopify/changes", {
              kind: "product_create", title: `Create draft product: ${v.title}`, productId: product?.id ?? null,
              payload: {
                title: v.title, descriptionHtml: v.descriptionHtml, productType: v.productType, tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean),
                seo: { title: v.seoTitle, description: v.seoDescription }, price: Number(v.price), compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
                cost: v.cost ? Number(v.cost) : null, option: v.optionName && values.length ? { name: v.optionName, values } : null,
                images: v.images.split("\n").map((s) => s.trim()).filter(Boolean).map((url) => ({ url, alt: v.title })), researchProductId: product?.id ?? null,
              },
            });
            if (r) setCreated(r.id);
          }}>Prepare change request</Button>
        </CardBody>
      </Card>
      <div className="space-y-5">
        {extra ? (
          <Card>
            <CardHeader title="Generated supporting copy" description="Add to the description if you want it on the page" />
            <CardBody className="space-y-3 text-xs">
              {extra.claimsToVerify.length > 0 && <Notice tone="warn" title="Verify against your physical sample before publishing">{extra.claimsToVerify.join(" · ")}</Notice>}
              <JsonViewClient value={{ features: extra.features, benefits: extra.benefits, faqs: extra.faqs, mediaToCapture: extra.imageSuggestions }} />
            </CardBody>
          </Card>
        ) : (
          <Notice>Pick a research product, optionally generate copy with AI, edit, then prepare a change request. The research product is linked to the new Shopify product for sales tracking.</Notice>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Landing
const EMPTY_LP: LandingPage = { headline: "", subheadline: "", problemTitle: "The problem", problemBody: "", solutionTitle: "The solution", solutionBody: "", demoTitle: "See it in action", demoBody: "", benefits: [], specs: [], faqs: [], trustPoints: [], ctaText: "Add to cart", accentColor: "#2563eb" };
export function LandingBuilder({ products, selectedId, connected, aiReady }: { products: Array<{ id: string; name: string; isDemo: boolean }>; selectedId: string | null; connected: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [lp, setLp] = React.useState<LandingPage>(EMPTY_LP);
  const [lists, setLists] = React.useState({ benefits: "", specs: "", faqs: "", trust: "" });
  const [themes, setThemes] = React.useState<Array<{ id: string; name: string; role: string }>>([]);
  const [themeId, setThemeId] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [allowLive, setAllowLive] = React.useState(false);
  const [gen, setGen] = React.useState<{ pending: boolean; err: string | null }>({ pending: false, err: null });
  const { submit, pending, error } = useSubmit<{ id: string }>();
  const [created, setCreated] = React.useState(false);
  React.useEffect(() => {
    if (!connected) return;
    api<{ themes: { nodes: Array<{ id: string; name: string; role: string }> } }>("/api/shopify/themes").then((r) => {
      setThemes(r.themes.nodes);
      setThemeId((r.themes.nodes.find((t) => t.role !== "MAIN") ?? r.themes.nodes[0])?.id ?? "");
    }).catch(() => setThemes([]));
  }, [connected]);
  const fromLp = (x: LandingPage) => setLists({
    benefits: x.benefits.map((b) => `${b.title} | ${b.body}`).join("\n"), specs: x.specs.map((s) => `${s.label} | ${s.value}`).join("\n"),
    faqs: x.faqs.map((f) => `${f.q} | ${f.a}`).join("\n"), trust: x.trustPoints.join("\n"),
  });
  const pairs = (s: string) => s.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]);
  const content = (): LandingPage => ({ ...lp, benefits: pairs(lists.benefits).map(([title, body]) => ({ title, body: body ?? "" })), specs: pairs(lists.specs).map(([label, value]) => ({ label, value: value ?? "" })), faqs: pairs(lists.faqs).map(([q, a]) => ({ q, a: a ?? "" })), trustPoints: lists.trust.split("\n").map((s) => s.trim()).filter(Boolean) });
  const set = (k: keyof LandingPage) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLp({ ...lp, [k]: e.target.value });
  const selectedTheme = themes.find((t) => t.id === themeId);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="Product landing page" description="A new section + page template in the chosen theme and an unpublished page — your existing theme files are not modified" action={
          <Select className="h-8 w-56 text-xs" value={selectedId ?? ""} onChange={(e) => router.push(`/store?tab=landing&productId=${e.target.value}`)}>
            <option value="">Choose research product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        } />
        <CardBody className="space-y-3">
          {selectedId && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={!aiReady} loading={gen.pending} onClick={async () => {
                setGen({ pending: true, err: null });
                try {
                  const r = await api<{ data: LandingPage }>("/api/shopify/ai/landing", { method: "POST", body: { productId: selectedId } });
                  setLp(r.data);
                  fromLp(r.data);
                  setGen({ pending: false, err: null });
                } catch (e) {
                  setGen({ pending: false, err: (e as Error).message });
                }
              }}>Generate content with AI</Button>
              {gen.err && <span className="text-[11px] text-bad">{gen.err}</span>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Headline" className="sm:col-span-2"><Input value={lp.headline} onChange={set("headline")} /></Field>
            <Field label="Subheadline" className="sm:col-span-2"><Input value={lp.subheadline} onChange={set("subheadline")} /></Field>
            <Field label="Problem title"><Input value={lp.problemTitle} onChange={set("problemTitle")} /></Field>
            <Field label="Solution title"><Input value={lp.solutionTitle} onChange={set("solutionTitle")} /></Field>
            <Field label="Problem text"><Textarea value={lp.problemBody} onChange={set("problemBody")} /></Field>
            <Field label="Solution text"><Textarea value={lp.solutionBody} onChange={set("solutionBody")} /></Field>
            <Field label="Demo section title"><Input value={lp.demoTitle} onChange={set("demoTitle")} /></Field>
            <Field label="Call to action"><Input value={lp.ctaText} onChange={set("ctaText")} /></Field>
            <Field label="Demo section text" className="sm:col-span-2"><Textarea value={lp.demoBody} onChange={set("demoBody")} /></Field>
            <Field label="Benefits (title | text, one per line)" className="sm:col-span-2"><Textarea value={lists.benefits} onChange={(e) => setLists({ ...lists, benefits: e.target.value })} /></Field>
            <Field label="Specifications (label | value)"><Textarea value={lists.specs} onChange={(e) => setLists({ ...lists, specs: e.target.value })} /></Field>
            <Field label="Trust points (verifiable only)"><Textarea value={lists.trust} onChange={(e) => setLists({ ...lists, trust: e.target.value })} /></Field>
            <Field label="FAQs (question | answer)" className="sm:col-span-2"><Textarea value={lists.faqs} onChange={(e) => setLists({ ...lists, faqs: e.target.value })} /></Field>
            <Field label="Accent colour"><Input type="color" value={/^#[0-9a-f]{6}$/i.test(lp.accentColor) ? lp.accentColor : "#2563eb"} onChange={set("accentColor")} /></Field>
            <Field label="Shopify product handle (for the buy button)"><Input placeholder="e.g. self-cleaning-brush" value={handle} onChange={(e) => setHandle(e.target.value)} /></Field>
            <Field label="Target theme" className="sm:col-span-2" hint={selectedTheme?.role === "MAIN" ? "This is your LIVE theme — prefer a duplicated copy." : undefined}>
              <Select value={themeId} onChange={(e) => setThemeId(e.target.value)} disabled={!connected}>
                {!connected && <option>Connect Shopify to choose a theme</option>}
                {themes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.role === "MAIN" ? "LIVE" : t.role.toLowerCase()})</option>)}
              </Select>
            </Field>
          </div>
          {selectedTheme?.role === "MAIN" && <label className="flex items-center gap-2 text-xs text-warn"><input type="checkbox" checked={allowLive} onChange={(e) => setAllowLive(e.target.checked)} /> Allow this change request to target the live theme (you will confirm again before applying)</label>}
          <FormError error={error} />
          {created && <Notice tone="good">Draft created. <Link className="text-accent" href="/store?tab=changes">Review and approve →</Link></Notice>}
          <Button disabled={!selectedId || !themeId || !lp.headline} loading={pending} onClick={async () => {
            const r = await submit("/api/shopify/landing-request", { productId: selectedId, themeId, shopifyProductHandle: handle || null, allowLiveTheme: allowLive, content: content() });
            if (r) setCreated(true);
          }}>Prepare change request</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Mobile preview" description="Approximate rendering; final styling inherits your theme" />
        <CardBody><LandingPreview lp={content()} /></CardBody>
      </Card>
    </div>
  );
}

function LandingPreview({ lp }: { lp: LandingPage }) {
  const accent = /^#[0-9a-f]{6}$/i.test(lp.accentColor) ? lp.accentColor : "#2563eb";
  return (
    <div className="mx-auto max-w-[390px] overflow-hidden rounded-[28px] border-4 border-border-strong bg-white text-[#111]">
      <div className="max-h-[640px] space-y-4 overflow-y-auto p-4 text-[13px]">
        <div className="aspect-square rounded-xl bg-gray-200" />
        <h1 className="text-2xl font-bold leading-tight">{lp.headline || "Headline"}</h1>
        <p className="text-gray-600">{lp.subheadline}</p>
        <button className="w-full rounded-lg py-3 font-semibold text-white" style={{ background: accent }}>{lp.ctaText}</button>
        {lp.trustPoints.length > 0 && <ul className="flex flex-wrap gap-x-3 text-[11px] text-gray-600">{lp.trustPoints.map((t, i) => <li key={i}>✓ {t}</li>)}</ul>}
        <h2 className="pt-2 text-lg font-bold">{lp.problemTitle}</h2><p>{lp.problemBody}</p>
        <h2 className="text-lg font-bold">{lp.solutionTitle}</h2><p>{lp.solutionBody}</p>
        <h2 className="text-lg font-bold">{lp.demoTitle}</h2><div className="aspect-[9/16] max-h-64 rounded-xl bg-gray-300" /><p>{lp.demoBody}</p>
        {lp.benefits.map((b, i) => <div key={i} className="rounded-lg bg-gray-100 p-3"><p className="font-semibold">{b.title}</p><p>{b.body}</p></div>)}
        {lp.specs.length > 0 && <table className="w-full">{lp.specs.map((s, i) => <tr key={i} className="border-b"><th className="py-1 text-left">{s.label}</th><td>{s.value}</td></tr>)}</table>}
        {lp.faqs.map((f, i) => <details key={i} className="border-b py-2"><summary className="font-semibold">{f.q}</summary><p>{f.a}</p></details>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Storefront
export function StorefrontGenerator({ aiReady }: { aiReady: boolean }) {
  const [brief, setBrief] = React.useState("");
  const [out, setOut] = React.useState<Record<string, unknown> | null>(null);
  const [state, setState] = React.useState<{ pending: boolean; err: string | null }>({ pending: false, err: null });
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card>
        <CardHeader title="Describe your storefront" />
        <CardBody className="space-y-3">
          <Textarea className="min-h-40" placeholder="e.g. A premium, minimal umbrella store for clever everyday problem-solvers for pets and home. Calm colours, trustworthy, fast shipping messaging…" value={brief} onChange={(e) => setBrief(e.target.value)} />
          <Button disabled={!aiReady || brief.trim().length < 10} loading={state.pending} onClick={async () => {
            setState({ pending: true, err: null });
            try {
              const r = await api<{ data: Record<string, unknown> }>("/api/shopify/ai/storefront", { method: "POST", body: { brief } });
              setOut(r.data);
              setState({ pending: false, err: null });
            } catch (e) {
              setState({ pending: false, err: (e as Error).message });
            }
          }}>Generate storefront content</Button>
          {!aiReady && <p className="text-[11px] text-faint">Requires ANTHROPIC_API_KEY.</p>}
          {state.err && <p className="text-xs text-bad">{state.err}</p>}
          <Notice>Homepage hero, announcement bar and banners depend on your theme's sections. Paste them in the theme editor, or ask the Store assistant to draft a theme change on an unpublished theme copy. Policy drafts must be reviewed (and legally checked) before use.</Notice>
        </CardBody>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Generated content" description="AI-generated — review before use" />
        <CardBody>{out ? <JsonViewClient value={out} /> : <p className="text-xs text-muted">Nothing generated yet.</p>}</CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Assistant
type Msg = { role: "user" | "assistant"; text: string; changeRequests: Array<{ id: string; title: string }> };
const EXAMPLES = ["Show me my current products.", "Create a product listing for my highest-scoring research product.", "Change the price of my newest product to $34.99.", "Create a collection for pet accessories.", "Generate a dedicated landing page for my top research product.", "Which products are performing best?"];
export function AssistantChat({ conversationId, initial, aiReady }: { conversationId: string | null; initial: Msg[]; aiReady: boolean }) {
  const router = useRouter();
  const [msgs, setMsgs] = React.useState<Msg[]>(initial);
  const [cid, setCid] = React.useState(conversationId);
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { setMsgs(initial); setCid(conversationId); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (m: string) => {
    if (!m.trim()) return;
    setPending(true);
    setErr(null);
    setMsgs((x) => [...x, { role: "user", text: m, changeRequests: [] }]);
    setText("");
    try {
      const r = await api<{ conversationId: string; reply: string; changeRequests: Array<{ id: string; title: string }>; meta: { model: string; costUsd: number } }>("/api/shopify/assistant", { method: "POST", body: { conversationId: cid ?? undefined, message: m } });
      setCid(r.conversationId);
      setMsgs((x) => [...x, { role: "assistant", text: r.reply, changeRequests: r.changeRequests }]);
      if (!cid) router.replace(`/store?tab=assistant&c=${r.conversationId}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Store management assistant" description="Inspects your store, then drafts changes for your approval. It cannot publish, change prices, edit themes or delete anything by itself." />
      <CardBody className="space-y-3">
        {!aiReady && <Notice tone="warn">Requires ANTHROPIC_API_KEY.</Notice>}
        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} disabled={!aiReady || pending} className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-50">{e}</button>)}</div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-lg bg-accent/15 px-3 py-2 text-sm" : "max-w-[90%] rounded-lg border border-border bg-bg/50 px-3 py-2 text-sm"}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.changeRequests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">{m.changeRequests.map((c) => <Link key={c.id} href="/store?tab=changes"><Badge tone="warn">Draft: {c.title}</Badge></Link>)}</div>
              )}
            </div>
          ))}
          {pending && <p className="text-xs text-faint">Inspecting the store and thinking…</p>}
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <Input value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="e.g. Make the product benefits more prominent on my landing page" disabled={!aiReady || pending} />
          <Button type="submit" loading={pending} disabled={!aiReady}>Send</Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Sales link
export function LinkProductForm({ products, connected }: { products: Array<{ id: string; name: string }>; connected: boolean }) {
  const { submit, pending, error } = useSubmit();
  const [shopifyProducts, setShopifyProducts] = React.useState<Array<{ id: string; title: string; handle: string }>>([]);
  const [pid, setPid] = React.useState("");
  const [sid, setSid] = React.useState("");
  React.useEffect(() => {
    if (!connected) return;
    api<{ products: { nodes: Array<{ id: string; title: string; handle: string }> } }>("/api/shopify/products").then((r) => setShopifyProducts(r.products.nodes)).catch(() => setShopifyProducts([]));
  }, [connected]);
  return (
    <Card>
      <CardHeader title="Link an existing Shopify product" />
      <CardBody className="space-y-3">
        <Field label="Research product"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Shopify product"><Select value={sid} onChange={(e) => setSid(e.target.value)} disabled={!connected}><option value="">{connected ? "Select…" : "Connect Shopify first"}</option>{shopifyProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
        <FormError error={error} />
        <Button size="sm" disabled={!pid || !sid} loading={pending} onClick={() => submit("/api/shopify/link", { productId: pid, shopifyProductGid: sid, handle: shopifyProducts.find((p) => p.id === sid)?.handle })}>Link products</Button>
      </CardBody>
    </Card>
  );
}
