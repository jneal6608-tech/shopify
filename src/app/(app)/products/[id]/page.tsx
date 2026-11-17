import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getProduct, listCategories } from "@/lib/services/products";
import { HttpError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation/common";
import { TabLinks } from "@/components/ui/primitives";
import { ProductHeader } from "./header";
import { OverviewTab } from "./tabs/overview";
import { TrendsTab } from "./tabs/trends";
import { CompetitorsTab } from "./tabs/competitors";
import { SuppliersTab } from "./tabs/suppliers";
import { ContentTab } from "./tabs/content";
import { ResearchTab } from "./tabs/research";

const TABS = [
  { key: "overview", label: "Overview & score" },
  { key: "trends", label: "Trends & sources" },
  { key: "competitors", label: "Competitors" },
  { key: "suppliers", label: "Suppliers" },
  { key: "content", label: "Faceless content" },
  { key: "research", label: "Research history" },
] as const;

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; range?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]["key"]) : "overview";
  const data = await withUser(user.id, async (db) => {
    try {
      return { product: await getProduct(db, id), categories: await listCategories(db) };
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  });
  if (!data) notFound();
  const { product, categories } = data;
  return (
    <>
      <ProductHeader product={product} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      <TabLinks active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/products/${id}?tab=${t.key}` }))} />
      {tab === "overview" && <OverviewTab userId={user.id} product={product} />}
      {tab === "trends" && <TrendsTab userId={user.id} product={product} range={sp.range} />}
      {tab === "competitors" && <CompetitorsTab userId={user.id} product={product} />}
      {tab === "suppliers" && <SuppliersTab userId={user.id} product={product} />}
      {tab === "content" && <ContentTab userId={user.id} product={product} />}
      {tab === "research" && <ResearchTab userId={user.id} product={product} />}
    </>
  );
}
