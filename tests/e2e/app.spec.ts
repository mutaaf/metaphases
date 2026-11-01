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
  await page.getByRole("button", { name: /sample portfolio/i }).first().click();
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
  for (const p of ["./", "./watchlist", "./compass", "./retrace", "./learn", "./about"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test("the week's brief: open on desktop, collapsed on phone, remembered, and its reporters open the sheet", async ({ page, isMobile }) => {
  await page.goto("/");
  const brief = page.locator(".brief");
  const head = brief.locator(".brief-head");
  await expect(head).toContainText("This week");
  await expect(head).toContainText("Nov 2–6");
  await expect(head).toContainText("336 companies report");
  await expect(head).toHaveAttribute("aria-expanded", isMobile ? "false" : "true");
  if (isMobile) await head.click();
  await expect(brief.locator(".brief-co")).toHaveCount(5);
  await expect(brief.locator(".brief-co").first()).toContainText("AAPL");
  await expect(brief.locator(".brief-macro")).toContainText("Jobs report");
  await expect(brief.locator(".brief-stat").first()).toContainText("including 1 of the 10 largest (Apple Inc.)");
  await expect(brief).toContainText(/Market mood reads \d+/);

  // The choice survives a reload.
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.locator(".brief-head")).toHaveAttribute("aria-expanded", "false");
  await page.locator(".brief-head").click();

  await brief.locator(".brief-co").first().click();
  await expect(page).toHaveURL(/t=AAPL/);
  await expect(page.locator(".sheet")).toBeVisible();
});

test("the brief follows navigation to another week", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "week view" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const head = page.locator(".brief-head");
  await expect(head).toContainText("Week of Nov 9–13");
  await expect(head).toContainText(/\d+ companies report · (\d+|none) of the 10 largest/);
  await expect(head).not.toContainText("336 companies");
});

test("the brief is honest when a week's earnings didn't load", async ({ page }) => {
  // The recorded November fixture couldn't load Nov 26 – Dec 4 (see its warnings).
  await page.goto("/?d=2026-11-30");
  await page.getByRole("button", { name: "week view" }).click();
  const head = page.locator(".brief-head");
  await expect(head).toContainText("Week of Nov 30–Dec 4");
  await expect(head).toContainText("Earnings for this week didn't load");
  await expect(head).not.toContainText("quiet");
});
