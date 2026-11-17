import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { listCategories } from "@/lib/services/products";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { scoreTone } from "@/components/ui/domain";
import { NewCategoryButton } from "./new-category";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const cats = await withUser(user.id, (db) => listCategories(db));
  return (
    <>
      <PageHeader title="Categories" description="Browse your research by category. Seed keywords drive scheduled discovery (rising Google Trends queries)." actions={<NewCategoryButton />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cats.map((c) => (
          <Link key={c.id} href={`/discover?category=${c.slug}`}>
            <Card className="h-full p-4 transition-colors hover:border-accent/50">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{c.name}</p>
                {c.userId && <Badge tone="accent">Custom</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="text-muted">{c.productCount} products</span>
                <span className={scoreTone(c.avgScore)}>avg {c.avgScore ?? "—"}</span>
                {c.risingCount > 0 && <Badge tone="good">{c.risingCount} rising</Badge>}
              </div>
              {c.seedKeywords.length > 0 && <p className="mt-2 truncate text-[11px] text-faint">Seeds: {c.seedKeywords.join(", ")}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
