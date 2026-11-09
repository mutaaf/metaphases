import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0015: the worker compares the next 14 days with Nasdaq's per-day calendar (unit-tested in crossCheck.test.ts).
// Here the client gets its output shape: AXON's projected Nov 2 (blank session) is listed by Nasdaq on Nov 5
// after the close (the company's real date); CEG's Nov 9 agrees.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

test.beforeEach(async ({ page }) => {
  const cal = JSON.parse(fx("calendar-2026-11.json"));
  for (const e of cal.events) {
    if (e.s === "AXON" && e.d === "2026-11-02") Object.assign(e, { x: "differs", xd: "2026-11-05", xh: "amc" });
    if (e.s === "CEG" && e.d === "2026-11-09") Object.assign(e, { x: "agree" });
  }
  await page.route("**/api/calendar**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cal) }));
});

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(0);

test("the day drawer names Nasdaq's date on a row the two calendars disagree on", async ({ page }) => {
  await page.goto("./?d=2026-11-02&day=2026-11-02");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".notice", { hasText: "isn't confirmed" })).toContainText("Nasdaq's calendar lists it on another day or time");
  const axon = drawer.locator(".erow", { hasText: "AXON" });
  await expect(axon.locator(".erow-x")).toHaveText("Nasdaq: Thu, Nov 5, after close");
  // Our feed's date isn't silently replaced: AXON stays on Nov 2, among the day's undated-session rows.
  await expect(drawer.locator(".erow-x")).toHaveCount(1);
  // The whole label is readable at 390px, not clipped to "Nasdaq: Thu, Nov 5, a…".
  expect(await axon.locator(".erow-x").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("xcheck-drawer.png") });
});

test("an agreeing row shows nothing extra", async ({ page }) => {
  await page.goto("./?d=2026-11-09&day=2026-11-09");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".erow", { hasText: "CEG" })).toBeVisible();
  await expect(drawer.locator(".erow-x")).toHaveCount(0);
  await expect(drawer.locator(".notice", { hasText: "confirmed" })).toHaveCount(0);
});

test("the sheet says the date isn't confirmed and names Nasdaq's day", async ({ page }) => {
  await page.route("**/api/ticker/AXON", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"AXON"'));
    body.next = { ...body.next, date: "2026-11-02", session: "", quarter: 3, year: 2026, epsE: 1.93, nasdaq: { date: "2026-11-05", session: "amc" } };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/AXON");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toHaveText("Monday, November 2"); // the feed's date stays
  await expect(card.getByTestId("nc-xcheck")).toHaveText("Two calendars disagree. Nasdaq's calendar lists it on Thursday, November 5, after close. Treat the date as unconfirmed until the company announces it.");
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("xcheck-sheet.png") });
});

test("a sheet with no disagreement has no note", async ({ page }) => {
  await page.goto("./t/NVDA");
  await expect(page.locator(".next-card h3")).toBeVisible();
  await expect(page.getByTestId("nc-xcheck")).toHaveCount(0);
});
