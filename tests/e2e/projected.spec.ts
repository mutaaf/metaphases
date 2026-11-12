import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0007: a date the company hasn't confirmed (blank session, or > 21 days ahead) is marked projected in the grid
// tile, the day drawer and the sheet; a dated session inside three weeks isn't. Clock frozen at 2026-10-31.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(0);

test("the drawer marks blank-session rows projected (AXON Nov 2) and leaves AAPL's after-close row alone", async ({ page }) => {
  await page.goto("./?d=2026-11-02&day=2026-11-02");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".erow", { hasText: "AXON" }).getByTestId("erow-proj")).toHaveText("Projected date");
  await expect(drawer.locator(".erow", { hasText: "AAPL" }).getByTestId("erow-proj")).toHaveCount(0);
  await expect(drawer.locator(".notice", { hasText: "projected" })).toContainText("haven't announced them yet");
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("projected-drawer.png") });
});

test("grid tiles: ARM's (blank session) is marked projected, AAPL's isn't", async ({ page }) => {
  await page.goto("./?d=2026-11-02");
  const arm = page.locator('.tbtn[title*="(ARM)"]').first();
  const aapl = page.locator('.tbtn[title*="(AAPL)"]').first();
  await expect(arm).toHaveClass(/tbtn-projected/);
  await expect(arm).toHaveAttribute("aria-label", /date not confirmed/);
  await expect(aapl).not.toHaveClass(/tbtn-projected/);
});

test("the sheet says a projected date isn't confirmed by the company; a firm one doesn't", async ({ page }) => {
  await page.route("**/api/ticker/GOOGL", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"GOOGL"'));
    body.next = { ...body.next, date: "2027-02-02", session: "amc", quarter: 4, year: 2026, projected: true };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/GOOGL");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toHaveText("Around Tuesday, February 2");
  await expect(card).toContainText("After close (projected)");
  await expect(card.getByTestId("nc-projected")).toHaveText("Date not yet confirmed by the company. The date and time shown are our data feed's projection and can move when the company announces its own.");
  await expect(card.locator(".nc-phase .phase-projected")).toHaveCount(1);
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("projected-sheet.png") });
  // A Nasdaq disagreement has its own note, which wins.
  await page.route("**/api/ticker/AXON", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"AXON"'));
    body.next = { ...body.next, date: "2026-11-02", session: "", projected: true, nasdaq: { date: "2026-11-05", session: "amc" } };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/AXON");
  await expect(page.getByTestId("nc-xcheck")).toBeVisible();
  await expect(page.getByTestId("nc-projected")).toHaveCount(0);
  await expect(page.locator(".next-card h3")).toHaveText("Monday, November 2");
  await page.goto("./t/NVDA");
  await expect(page.locator(".next-card h3")).toBeVisible();
  await expect(page.getByTestId("nc-projected")).toHaveCount(0);
});
