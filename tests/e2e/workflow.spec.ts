import { expect, test } from "@playwright/test";

const name = `E2E Litter mat ${Date.now()}`;

test.describe.serial("discovery → research → testing → calculator (UI)", () => {
  let productUrl = "";

  test("dashboard renders key sections", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Today's recommendation")).toBeVisible();
    await expect(page.getByText("Researched products")).toBeVisible();
  });

  test("creates a product from Discover", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("button", { name: "Add product" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Product name *").fill(name);
    await dialog.getByLabel("Keywords (comma separated)").fill("cat litter mat");
    await dialog.getByLabel("Est. supplier cost ($)").fill("5.5");
    await dialog.getByLabel("Est. shipping cost ($)").fill("3");
    await dialog.getByLabel("Est. selling price ($)").fill("27.99");
    await dialog.getByRole("button", { name: "Create product" }).click();
    await page.waitForURL(/\/products\//);
    productUrl = page.url();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Opportunity score breakdown")).toBeVisible();
    await expect(page.getByText("Missing information (penalised, lowers confidence)")).toBeVisible();
    await expect(page.getByText("Insufficient evidence").first()).toBeVisible();
  });

  test("searches and filters on Discover", async ({ page }) => {
    await page.goto(`/discover?q=${encodeURIComponent("Litter mat")}&maxCost=6`);
    await expect(page.getByRole("link", { name })).toBeVisible();
    await page.goto(`/discover?q=${encodeURIComponent("Litter mat")}&maxCost=2`);
    await expect(page.getByText("No products match")).toBeVisible();
  });

  test("rates faceless content formats and the score updates", async ({ page }) => {
    await page.goto(`${productUrl}?tab=content`);
    await expect(page.getByText("Faceless content potential")).toBeVisible();
    for (const n of ["3", "3", "3"]) await page.getByRole("button", { name: n, exact: true }).first().click();
    await page.getByRole("button", { name: "Save format ratings" }).click();
    await expect(page.getByText(/Saved content assessment/)).toBeVisible();
    await page.goto(productUrl);
    await expect(page.getByText("Your rating").first()).toBeVisible();
  });

  test("records a manual observation with a source URL", async ({ page }) => {
    await page.goto(`${productUrl}?tab=trends`);
    const form = page.locator("form").filter({ hasText: "Save observation" });
    await form.getByLabel("Metric").selectOption("tiktok_video_count");
    await form.getByLabel("Value").fill("1250");
    await form.getByLabel("Source URL").fill("https://ads.tiktok.com/business/creativecenter/example");
    await form.getByRole("button", { name: "Save observation" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("cell", { name: /tiktok_video_count/ }).first()).toBeVisible();
  });

  test("moves the product to testing and records a video", async ({ page }) => {
    const id = productUrl.split("/products/")[1].split("?")[0];
    await page.goto(`/testing/${id}`);
    page.once("dialog", (d) => d.accept("Sample looks good"));
    await page.getByRole("button", { name: "Testing", exact: true }).click();
    await expect(page.getByText("Testing").first()).toBeVisible();
    await page.getByRole("button", { name: "Video" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Title / label").fill("Mess-free litter demo");
    await dialog.getByLabel("Opening hook used").fill("Your cat's litter is everywhere — watch this");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Mess-free litter demo").first()).toBeVisible();
    await expect(page.getByText("Insufficient evidence — keep testing")).toBeVisible();
  });

  test("profit calculator reacts to inputs", async ({ page }) => {
    await page.goto("/calculator?price=30&cost=8&shipping=4");
    await expect(page.getByText("Contribution per sale (before marketing)")).toBeVisible();
    await expect(page.getByText("$14.83").first()).toBeVisible();
    await page.getByLabel("Marketing cost / sale ($)").fill("20");
    await expect(page.getByText("Marketing cost per sale exceeds the contribution per sale.")).toBeVisible();
  });

  test("settings shows model choice and integration status", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Claude Opus 5.5")).toBeVisible();
    await expect(page.getByText("Claude Sonnet 5.5")).toBeVisible();
    await expect(page.getByText("Integration status")).toBeVisible();
    await expect(page.getByText(/Not configured — AI features disabled/)).toBeVisible();
  });

  test("store builder enforces review before apply", async ({ page }) => {
    await page.goto("/store?tab=connection");
    await expect(page.getByText("Required access scopes")).toBeVisible();
    await page.goto("/store?tab=changes");
    await expect(page.getByText(/Lifecycle: draft/)).toBeVisible();
    const apply = page.getByRole("button", { name: "Apply to store" }).first();
    if (await apply.count()) await expect(apply).toBeDisabled();
  });

  test("demo data is labelled everywhere it appears", async ({ page }) => {
    await page.goto("/discover?q=%5BDEMO%5D");
    const rows = page.getByRole("link", { name: /\[DEMO\]/ });
    if ((await rows.count()) > 0) {
      await expect(page.getByText("DEMO DATA").first()).toBeVisible();
      await expect(page.getByText("Demo data loaded — not real market data")).toBeVisible();
    }
  });
});
