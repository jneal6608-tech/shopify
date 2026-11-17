import { describe, expect, it } from "vitest";
import { aggregateOrders, type OrderNode } from "@/lib/shopify/aggregate";
import { buildLandingSection, buildLandingTemplate, escapeLiquid, landingHandle } from "@/lib/shopify/landing";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { PAYLOADS, describeChange } from "@/lib/shopify/changes";

const P = "gid://shopify/Product/1";
const order = (id: string, createdAt: string, items: Array<[string, number, string]>, opts: Partial<OrderNode> = {}): OrderNode => ({
  id, createdAt, cancelledAt: null,
  lineItems: { nodes: items.map(([pid, q, amt]) => ({ quantity: q, product: { id: pid }, originalTotalSet: { shopMoney: { amount: amt } } })) },
  refunds: [], ...opts,
});

describe("aggregateOrders", () => {
  it("aggregates linked products per day, excluding cancelled orders", () => {
    const rows = aggregateOrders(
      [
        order("o1", "2026-11-01T10:00:00Z", [[P, 1, "30.00"], ["gid://shopify/Product/2", 1, "10.00"]]),
        order("o2", "2026-11-01T12:00:00Z", [[P, 2, "60.00"]]),
        order("o3", "2026-11-01T13:00:00Z", [[P, 1, "30.00"]], { cancelledAt: "2026-11-01T14:00:00Z" }),
        order("o4", "2026-11-02T09:00:00Z", [[P, 1, "30.00"]], {
          refunds: [{ createdAt: "2026-11-05T00:00:00Z", refundLineItems: { nodes: [{ quantity: 1, lineItem: { product: { id: P } }, subtotalSet: { shopMoney: { amount: "30.00" } } }] } }],
        }),
      ],
      new Set([P]),
    );
    const d1 = rows.find((r) => r.day === "2026-11-01")!;
    expect(d1).toMatchObject({ orders: 2, units: 3, revenue: 90 });
    expect(rows.find((r) => r.day === "2026-11-05")).toMatchObject({ refundCount: 1, refundsAmount: 30, orders: 0 });
    expect(rows.every((r) => r.shopifyProductId === P)).toBe(true);
  });
});

describe("landing page builder", () => {
  it("escapes HTML and Liquid delimiters in generated copy", () => {
    expect(escapeLiquid("<script>{{ x }}{% y %}</script>")).not.toMatch(/[<>{}%]/);
    const liquid = buildLandingSection(
      { headline: "Hi {{ shop.secret }}", subheadline: "<img onerror=alert(1)>", problemTitle: "p", problemBody: "b", solutionTitle: "s", solutionBody: "b", demoTitle: "d", demoBody: "b", benefits: [{ title: "t", body: "b" }], specs: [{ label: "l", value: "v" }], faqs: [{ q: "q", a: "a" }], trustPoints: ["30-day returns"], ctaText: "Buy", accentColor: "red;}</style>" },
      "paw-cleaner",
    );
    expect(liquid).not.toContain("{{ shop.secret }}");
    expect(liquid).not.toContain("<img onerror");
    expect(liquid).toContain("--accent:#2563eb"); // invalid colour replaced
    expect(liquid).toContain('"type": "product"');
    expect(JSON.parse(buildLandingTemplate("di-landing-x", "paw"))).toEqual({ sections: { main: { type: "di-landing-x", settings: { product: "paw" } } }, order: ["main"] });
    expect(landingHandle("Dog Paw Cleaner!!")).toBe("dog-paw-cleaner");
  });
});

describe("shopify validation", () => {
  it("normalises shop domains and rejects junk", () => {
    expect(normalizeShopDomain("https://My-Store.myshopify.com/admin")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(() => normalizeShopDomain("evil.com/../x")).toThrow();
  });
  it("always creates products as drafts and validates GIDs", () => {
    const p = PAYLOADS.product_create.parse({ title: "X", price: 19.9 });
    expect(p.price).toBe("19.90");
    expect(describeChange("product_create", p, {})[0].after).toMatch(/DRAFT/);
    expect(PAYLOADS.price_update.safeParse({ productId: "123", variants: [{ id: "gid://shopify/ProductVariant/1", price: 5 }] }).success).toBe(false);
    expect(PAYLOADS.theme_files_upsert.safeParse({ themeId: "gid://shopify/OnlineStoreTheme/1", files: [{ filename: "../../etc/passwd", content: "" }] }).success).toBe(false);
  });
});
