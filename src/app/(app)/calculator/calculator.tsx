"use client";
import * as React from "react";
import { computeScenarios, computeUnitEconomics, DEFAULT_PROFIT_INPUT, type ProfitInput } from "@/lib/analytics/profit";
import { Button, Card, CardBody, CardHeader, Field, Input, Notice, Select, Table, Td, Th } from "@/components/ui/primitives";
import { useSubmit } from "@/components/ui/action";
import { cn, fmtMoney, fmtPct } from "@/lib/utils";

type Key = keyof ProfitInput;
const FIELDS: Array<{ key: Key; label: string; step: string; hint?: string }> = [
  { key: "sellingPrice", label: "Selling price ($)", step: "0.01" },
  { key: "supplierCost", label: "Supplier cost ($)", step: "0.01" },
  { key: "shippingCost", label: "Shipping cost ($)", step: "0.01" },
  { key: "paymentFeePct", label: "Payment processing (%)", step: "0.1", hint: "Shopify Payments US online ≈ 2.9% + 30¢ on Basic — check your plan" },
  { key: "paymentFixedFee", label: "Payment fixed fee ($)", step: "0.01" },
  { key: "shopifyTxnFeePct", label: "Shopify transaction fee (%)", step: "0.1", hint: "0 with Shopify Payments; charged with third-party gateways" },
  { key: "refundRatePct", label: "Expected refund rate (%)", step: "0.5", hint: "Refunded orders lose the full price; product cost is not recovered" },
  { key: "otherVariablePerUnit", label: "Other variable cost / order ($)", step: "0.01", hint: "Packaging, inserts, per-order app fees" },
  { key: "marketingPerUnit", label: "Marketing cost / sale ($)", step: "0.01", hint: "0 for purely organic content; include paid boosts or creator fees" },
  { key: "fixedMonthlyCosts", label: "Fixed monthly costs ($)", step: "1", hint: "Shopify plan, apps, tools, domain" },
];

export function Calculator({ fees, products, initial }: { fees: Partial<ProfitInput>; products: Array<{ id: string; name: string; estSellingPrice: number | null; estSupplierCost: number | null; estShippingCost: number | null }>; initial: Partial<ProfitInput> }) {
  const base = { ...DEFAULT_PROFIT_INPUT, ...fees, sellingPrice: 29.99, supplierCost: 7, shippingCost: 4 };
  const [v, setV] = React.useState<Record<Key, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key] ?? base[f.key])])) as Record<Key, string>,
  );
  const [volumes, setVolumes] = React.useState("10, 50, 100, 500");
  const [scenarioB, setScenarioB] = React.useState<{ price: string; cost: string } | null>(null);
  const [productId, setProductId] = React.useState("");
  const { submit, pending, error } = useSubmit();
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);

  const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, Number(v[f.key])])) as unknown as ProfitInput;
  const vols = volumes.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 8);
  let unit: ReturnType<typeof computeUnitEconomics> | null = null;
  let rows: ReturnType<typeof computeScenarios> = [];
  let err: string | null = null;
  try {
    unit = computeUnitEconomics(parsed);
    rows = computeScenarios(parsed, vols);
  } catch (e) {
    err = (e as Error).message;
  }
  let unitB: ReturnType<typeof computeUnitEconomics> | null = null;
  if (scenarioB) {
    try {
      unitB = computeUnitEconomics({ ...parsed, sellingPrice: Number(scenarioB.price), supplierCost: Number(scenarioB.cost) });
    } catch {
      unitB = null;
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card>
        <CardHeader title="Inputs" action={
          <Select className="h-8 w-48 text-xs" value={productId} onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            setProductId(e.target.value);
            if (p) setV((s) => ({ ...s, sellingPrice: String(p.estSellingPrice ?? s.sellingPrice), supplierCost: String(p.estSupplierCost ?? s.supplierCost), shippingCost: String(p.estShippingCost ?? s.shippingCost) }));
          }}>
            <option value="">Load from product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        } />
        <CardBody className="space-y-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input type="number" min="0" step={f.step} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            </Field>
          ))}
          {productId && (
            <div className="space-y-1">
              <Button size="sm" variant="secondary" loading={pending} onClick={async () => {
                const r = await submit(`/api/products/${productId}`, { estSellingPrice: parsed.sellingPrice, estSupplierCost: parsed.supplierCost, estShippingCost: parsed.shippingCost }, { method: "PATCH" });
                if (r !== undefined) setSavedMsg("Saved as the product's estimates; score recomputed.");
              }}>Save price & costs to product</Button>
              {savedMsg && <p className="text-[11px] text-good">{savedMsg}</p>}
              {error && <p className="text-[11px] text-bad">{error}</p>}
            </div>
          )}
        </CardBody>
      </Card>
      <div className="space-y-5 xl:col-span-2">
        {err ? <Notice tone="bad">{err}</Notice> : unit && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Big label="Contribution per sale (before marketing)" value={fmtMoney(unit.contributionBeforeMarketing)} sub={`${fmtPct(unit.contributionMarginPct)} margin`} tone={unit.contributionBeforeMarketing > 0 ? "good" : "bad"} />
              <Big label="Profit per sale (after marketing)" value={fmtMoney(unit.contributionAfterMarketing)} sub={`${fmtPct(unit.netMarginPct)} · before fixed costs`} tone={unit.contributionAfterMarketing > 0 ? "good" : "bad"} />
              <Big label="Break-even orders / month" value={unit.breakEvenUnitsPerMonth === null ? "never" : String(unit.breakEvenUnitsPerMonth)} sub={`to cover ${fmtMoney(parsed.fixedMonthlyCosts)} fixed`} />
            </div>
            {unit.warnings.length > 0 && <Notice tone="warn">{unit.warnings.join(" ")}</Notice>}
            <Card>
              <CardHeader title="Per-unit breakdown" />
              <Table>
                <tbody>
                  <Line k="Gross revenue" v={unit.revenuePerUnit} />
                  <Line k="Cost of goods (supplier + shipping)" v={-unit.costOfGoods} />
                  <Line k="Payment processing" v={-unit.paymentFees} />
                  <Line k="Shopify transaction fee" v={-unit.shopifyFees} />
                  <Line k="Expected refunds" v={-unit.expectedRefundCost} />
                  <Line k="Other variable costs" v={-unit.otherVariable} />
                  <Line k="Total variable costs" v={-unit.totalVariableCosts} strong />
                  <Line k="Contribution before marketing" v={unit.contributionBeforeMarketing} strong />
                  <Line k="Marketing per sale" v={-unit.marketingPerUnit} />
                  <Line k="Contribution after marketing" v={unit.contributionAfterMarketing} strong />
                </tbody>
              </Table>
              <CardBody className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                <p>Break-even selling price: <span className="font-medium text-fg">{fmtMoney(unit.breakEvenSellingPrice)}</span> (zero contribution before marketing)</p>
                <p>Break-even customer acquisition cost: <span className="font-medium text-fg">{fmtMoney(unit.breakEvenCac)}</span> (max you can spend to acquire one customer)</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Volume scenarios (monthly)" action={<Input className="h-8 w-48 text-xs" value={volumes} onChange={(e) => setVolumes(e.target.value)} aria-label="Volumes" />} />
              <Table>
                <thead><tr><Th>Units</Th><Th className="text-right">Revenue</Th><Th className="text-right">Refunds</Th><Th className="text-right">Variable costs</Th><Th className="text-right">Contribution</Th><Th className="text-right">Marketing</Th><Th className="text-right">Fixed</Th><Th className="text-right">Net profit</Th><Th className="text-right">Net margin</Th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.units}>
                      <Td className="tabular-nums">{r.units}</Td>
                      <Td className="text-right tabular-nums">{fmtMoney(r.grossRevenue)}</Td>
                      <Td className="text-right tabular-nums text-muted">{fmtMoney(-r.refunds)}</Td>
                      <Td className="text-right tabular-nums text-muted">{fmtMoney(-r.variableCosts)}</Td>
                      <Td className="text-right tabular-nums">{fmtMoney(r.contributionBeforeMarketing)}</Td>
                      <Td className="text-right tabular-nums text-muted">{fmtMoney(-r.marketing)}</Td>
                      <Td className="text-right tabular-nums text-muted">{fmtMoney(-r.fixedCosts)}</Td>
                      <Td className={cn("text-right font-semibold tabular-nums", r.netProfit >= 0 ? "text-good" : "text-bad")}>{fmtMoney(r.netProfit)}</Td>
                      <Td className="text-right tabular-nums">{fmtPct(r.netMarginPct)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Compare a what-if scenario" action={!scenarioB && <Button size="sm" variant="secondary" onClick={() => setScenarioB({ price: v.sellingPrice, cost: v.supplierCost })}>Add scenario B</Button>} />
              {scenarioB && (
                <CardBody className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:w-96">
                    <Field label="B: selling price"><Input type="number" step="0.01" value={scenarioB.price} onChange={(e) => setScenarioB({ ...scenarioB, price: e.target.value })} /></Field>
                    <Field label="B: supplier cost"><Input type="number" step="0.01" value={scenarioB.cost} onChange={(e) => setScenarioB({ ...scenarioB, cost: e.target.value })} /></Field>
                  </div>
                  {unitB && (
                    <p className="text-xs text-muted">Scenario B contribution {fmtMoney(unitB.contributionBeforeMarketing)} ({fmtPct(unitB.contributionMarginPct)}) vs A {fmtMoney(unit.contributionBeforeMarketing)} — difference <span className="font-medium text-fg">{fmtMoney(unitB.contributionBeforeMarketing - unit.contributionBeforeMarketing)}</span> per sale; at 100 units/month that is {fmtMoney((unitB.contributionBeforeMarketing - unit.contributionBeforeMarketing) * 100)}.</p>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setScenarioB(null)}>Remove</Button>
                </CardBody>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </Card>
  );
}
function Line({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <tr>
      <Td className={strong ? "font-medium" : "text-muted"}>{k}</Td>
      <Td className={cn("text-right tabular-nums", strong && "font-semibold", v < 0 && "text-muted")}>{fmtMoney(v)}</Td>
    </tr>
  );
}
