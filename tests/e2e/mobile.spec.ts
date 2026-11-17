import { expect, test } from "@playwright/test";

test("navigation works on mobile and pages do not scroll horizontally", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Profit Calculator" }).click();
  await page.waitForURL(/calculator/);
  for (const path of ["/dashboard", "/discover", "/calculator", "/testing"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
  }
});
