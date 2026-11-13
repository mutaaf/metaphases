// /app/: Moon Club's parallax page. The App Store button is above the fold at phone width, nothing scrolls sideways,
// and reduced motion gets a static, readable page.
import { test, expect } from "./fixtures";

const STORE = "https://apps.apple.com/us/app/moon-club/id6829860949";

test("the App Store button is above the fold and the page never scrolls sideways", async ({ page }) => {
  await page.goto("./app/");
  await expect(page.locator("h1")).toContainText("Moon Club");
  const cta = page.locator('a[data-cta="hero"]');
  await expect(cta).toHaveAttribute("href", STORE);
  await expect(cta).toBeInViewport();
  const box = (await cta.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(page.locator('a[data-cta="top"]')).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\bfx\b/);
  for (const y of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((f) => scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), y);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  }
});

test("reduced motion: no scroll effects, the Duo poses read as cards", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("./app/");
  await expect(page.locator("html")).not.toHaveClass(/\bfx\b/);
  await expect(page.locator(".step.s3 .still")).toBeVisible();
  await expect(page.locator(".duo-scene")).toBeHidden();
  await ctx.close();
});
