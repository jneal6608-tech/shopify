import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { Calculator } from "./calculator";

export const metadata = { title: "Profit Calculator" };

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { prefs, products } = await withUser(user.id, async (db) => ({
    prefs: (await db<{ feeSettings: Record<string, number> }[]>`select fee_settings from public.user_preferences`)[0],
    products: await db<{ id: string; name: string; estSellingPrice: number | null; estSupplierCost: number | null; estShippingCost: number | null }[]>`
      select id, name, est_selling_price, est_supplier_cost, est_shipping_cost from public.products where stage <> 'archived' order by updated_at desc limit 100`,
  }));
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return (
    <>
      <PageHeader title="Profit Calculator" description="Model unit economics and volume scenarios. Contribution before marketing is kept separate from net profit after marketing and fixed costs." />
      <Calculator
        fees={prefs?.feeSettings ?? {}}
        products={products}
        initial={{ sellingPrice: num(sp.price), supplierCost: num(sp.cost), shippingCost: num(sp.shipping) }}
      />
    </>
  );
}
