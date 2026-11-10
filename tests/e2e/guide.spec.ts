// The guide is a static page with its text in the HTML; the footer links to it.
import { test, expect } from "./fixtures";

test("the guide reads without JS and links back to the calendar", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("./guide/");
  await expect(page.locator("h1")).toContainText("Metaphases Guide");
  await expect(page.getByText(/not financial advice/i).first()).toBeVisible();
  await expect(page.locator('a.btn[href="/metaphases/"]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

test("the footer links to the guide", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('footer.colophon a[href="/metaphases/guide/"]')).toHaveText("Guide");
});
