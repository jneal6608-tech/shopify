import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { listCategories, listProducts } from "@/lib/services/products";
import { productFiltersSchema } from "@/lib/validation/products";
import { Button, ButtonLink, Card, CardBody, CardHeader, Empty, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { ProductTable } from "@/components/products/product-table";
import { NewProductButton } from "@/components/products/new-product-button";
import { SaveSearchButton, DeleteSavedSearch } from "./saved-search";
import { DiscoveryCandidates } from "./candidates";
import { STAGES, STAGE_LABELS } from "@/lib/validation/common";

export const metadata = { title: "Discover Products" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]));
  const parsed = productFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : productFiltersSchema.parse({});
  const { products, categories, saved, candidates } = await withUser(user.id, async (db) => ({
    products: await listProducts(db, filters),
    categories: await listCategories(db),
    saved: await db<{ id: string; name: string; filters: Record<string, string> }[]>`select id, name, filters from public.saved_searches order by created_at desc`,
    candidates: await db<{ id: string; query: string; sourceKey: string; evidence: Record<string, unknown>; lastSeenAt: Date; categoryName: string | null; isDemo: boolean }[]>`
      select d.id, d.query, d.source_key, d.evidence, d.last_seen_at, c.name as category_name, d.is_demo
      from public.discovery_candidates d left join public.categories c on c.id = d.category_id
      where d.status = 'new' order by d.last_seen_at desc limit 20`,
  }));
  const activeFilters = Object.fromEntries(Object.entries(raw).filter(([, v]) => v));
  const cats = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        title="Discover Products"
        description="Search, filter and rank every product you are researching. Scores are computed from recorded evidence; products without data are not rewarded."
        actions={<NewProductButton categories={cats} />}
      />
      <Card className="mb-5">
        <form className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-8" method="get">
          <Field label="Search" className="col-span-2"><Input name="q" defaultValue={filters.q} placeholder="Name, keyword, problem…" /></Field>
          <Field label="Category">
            <Select name="category" defaultValue={filters.category ?? ""}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Niche"><Input name="niche" defaultValue={filters.niche} /></Field>
          <Field label="Demand direction">
            <Select name="direction" defaultValue={filters.direction ?? ""}>
              <option value="">Any</option>
              <option value="up">Trending up (emerging + rising)</option>
              <option value="emerging">Emerging</option>
              <option value="rapidly_rising">Rapidly rising</option>
              <option value="stable">Stable</option>
              <option value="seasonal">Seasonal</option>
              <option value="saturating">Saturating</option>
              <option value="declining">Declining</option>
              <option value="insufficient_data">Insufficient data</option>
            </Select>
          </Field>
          <Field label="Stage">
            <Select name="stage" defaultValue={filters.stage ?? ""}>
              <option value="">Active (not archived)</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="Sort by" className="col-span-2">
            <Select name="sort" defaultValue={filters.sort}>
              <option value="opportunity">Opportunity score</option>
              <option value="newest">Newest discoveries</option>
              <option value="rising">Rising demand</option>
              <option value="declining">Declining demand</option>
              <option value="confidence">Confidence</option>
            </Select>
          </Field>
          <Field label="Price min $"><Input name="minPrice" type="number" step="0.01" defaultValue={filters.minPrice} /></Field>
          <Field label="Price max $"><Input name="maxPrice" type="number" step="0.01" defaultValue={filters.maxPrice} /></Field>
          <Field label="Supplier cost min $"><Input name="minCost" type="number" step="0.01" defaultValue={filters.minCost} /></Field>
          <Field label="Supplier cost max $"><Input name="maxCost" type="number" step="0.01" defaultValue={filters.maxCost} /></Field>
          <Field label="Min est. margin %"><Input name="minMargin" type="number" defaultValue={filters.minMargin} /></Field>
          <Field label="Min competition score" hint="Higher = less competitive"><Input name="minCompetition" type="number" defaultValue={filters.minCompetition} /></Field>
          <Field label="Min trend growth %"><Input name="minGrowth" type="number" defaultValue={filters.minGrowth} /></Field>
          <Field label="Min content potential"><Input name="minContent" type="number" defaultValue={filters.minContent} /></Field>
          <div className="col-span-2 flex items-end gap-2 md:col-span-4 xl:col-span-8">
            <Button type="submit">Apply filters</Button>
            <ButtonLink href="/discover" variant="ghost">Reset</ButtonLink>
            <label className="ml-2 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="bookmarked" value="1" defaultChecked={filters.bookmarked === "1"} /> Bookmarked only</label>
            <div className="flex-1" />
            <SaveSearchButton filters={activeFilters} />
          </div>
        </form>
      </Card>

      {saved.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-faint">Saved searches:</span>
          {saved.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs">
              <Link href={`/discover?${new URLSearchParams(s.filters).toString()}`} className="text-muted hover:text-fg">{s.name}</Link>
              <DeleteSavedSearch id={s.id} />
            </span>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title={`${products.length} product${products.length === 1 ? "" : "s"}`} description="Select up to five products to compare." />
        {products.length === 0 ? (
          <CardBody>
            <Empty title="No products match" action={<NewProductButton categories={cats} />}>
              Add a product you want to research, promote a discovery candidate below, or load demo data from Settings.
            </Empty>
          </CardBody>
        ) : (
          <ProductTable products={products} />
        )}
      </Card>

      <DiscoveryCandidates candidates={candidates} categories={cats} />
    </>
  );
}
