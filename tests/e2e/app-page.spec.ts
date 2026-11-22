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

test("the trailer: self-hosted, muted autoplay loop, 9:16 on phones, 16:9 above", async ({ page }) => {
  await page.goto("./app/");
  const v = page.locator(".reel video");
  for (const a of ["autoplay", "muted", "loop", "playsinline"]) await expect(v).toHaveAttribute(a, "");
  await expect(v).toHaveAttribute("preload", "metadata");
  await expect(v.locator('source[media="(max-width: 700px)"]')).toHaveAttribute("src", "reel-9x16.mp4");
  await expect(v.locator("source:not([media])")).toHaveAttribute("src", "reel-16x9.mp4");
  await expect(v).toBeVisible();
  // Open-source Chromium builds may lack H.264; where the browser can play mp4, check it picked the right cut.
  if (await v.evaluate((el: HTMLVideoElement) => el.canPlayType("video/mp4") !== "")) {
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.currentSrc)).not.toBe("");
    const src = await v.evaluate((el: HTMLVideoElement) => el.currentSrc);
    expect(new URL(src).origin).toBe(new URL(page.url()).origin);
    expect(src).toMatch(page.viewportSize()!.width <= 700 ? /reel-9x16\.mp4$/ : /reel-16x9\.mp4$/);
  }
  // The trailer sits under the hero; the App Store button stays the first thing on screen.
  await expect(page.locator('a[data-cta="hero"]')).toBeInViewport();
});

test("reduced motion: the trailer is a still, never playing", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("./app/");
  await expect(page.locator(".reel video")).toBeHidden();
  await expect(page.locator(".reel-still img")).toBeVisible();
  expect(await page.locator(".reel video").evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await ctx.close();
});
