import { test, expect } from "./fixtures";

test("calendar opens on next trading day's month with the headline, mood and macro strip", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("November");
  await expect(page.locator(".mood-num")).toHaveText(/\d+/);
  await expect(page.locator(".macro-ev").first()).toBeVisible();
  await expect(page.locator(".next-badge")).toContainText("NOV 02");
  await expect(page.locator(".tbtn").first()).toBeVisible();
  // The app lives under mutaafaziz.com/metaphases/: every internal link must keep the base path.
  await expect(page.locator(".nav a", { hasText: "Compass" })).toHaveAttribute("href", "/metaphases/compass");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/metaphases/manifest.webmanifest");
});

test("tapping a company opens the deep sheet with both grades and reaction history", async ({ page }) => {
  await page.goto("./");
  await page.locator(".tbtn").first().click();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Setup into the print", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Compass quality", { exact: true })).toBeVisible();
  await expect(sheet.locator(".rx-col")).toHaveCount(4);
  await expect(page).toHaveURL(/\?t=/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("share URLs /t/SYM open that sheet", async ({ page }) => {
  await page.goto("./t/aapl");
  await expect(page.locator(".sheet h2")).toBeVisible();
  await expect(page).toHaveURL(/\?t=AAPL/);
});

test("glossary terms explain themselves", async ({ page }) => {
  await page.goto("./");
  await page.locator(".macro-mood .term-btn").click();
  await expect(page.locator(".term-pop")).toContainText("fear-to-greed");
});

test("day drawer lists reporters by session", async ({ page }) => {
  await page.goto("./");
  await page.locator(".cell[role=button]").nth(1).locator(".cell-head").click();
  await expect(page.locator(".drawer h2")).toBeVisible();
  await expect(page.locator(".sess-head").first()).toBeVisible();
});

test("week and day views render", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".wcol")).toHaveCount(5);
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".dayview")).toBeVisible();
});

test("search finds a company by name and opens it", async ({ page, isMobile }) => {
  await page.goto("./");
  if (isMobile) await page.getByRole("button", { name: /search ticker/i }).click();
  else await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/search a ticker/i).fill("microsoft");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/t=MSFT/);
});

test("Compass maps a sample portfolio's exposure through funds", async ({ page }) => {
  await page.goto("./compass");
  await page.getByRole("button", { name: /sample portfolio/i }).click();
  await expect(page.locator(".stat b").first()).toContainText("$");
  await expect(page.locator(".ex-row").first()).toBeVisible();
});

test("Retrace grades the month", async ({ page }) => {
  await page.goto("./retrace");
  await expect(page.locator(".big-strip")).toBeVisible();
  await expect(page.locator(".stat").first()).toContainText(/\d+/);
});

test("no horizontal scroll and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  for (const p of ["./", "./watchlist", "./compass", "./retrace", "./learn"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
