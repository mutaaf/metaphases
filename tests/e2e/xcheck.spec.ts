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
    // 0062: same date, other session (DE/ROAD-shaped): Finnhub "amc", Nasdaq "bmo".
    if (e.s === "AMAT" && e.d === "2026-11-12") Object.assign(e, { x: "differs", xd: "2026-11-12", xh: "bmo" });
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

// 0060: a session the two calendars disagree on doesn't set the typical move on either feed's word.
for (const [inferred, text] of [
  ["bmo", "Because the two calendars disagree on the time, the typical move is measured on the day this stock has usually moved after a report: the report day itself (as for a report before the open)."],
  ["", "Because the two calendars disagree on the time, and the stock's past moves don't settle it, we can't tell which day the market reacted, so past moves show “—”."],
] as const) {
  test(`a contested session says how the typical move was measured (${inferred || "unknown"})`, async ({ page }) => {
    await page.route("**/api/ticker/ADI", async (r) => {
      const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"ADI"'));
      body.next = { ...body.next, date: "2026-11-24", session: "amc", quarter: 4, year: 2026, nasdaq: { date: "2026-11-24", session: "bmo" } };
      body.moveSession = { feed: "amc", nasdaq: "bmo", session: inferred };
      if (!inferred) { body.expectedMove = null; body.history = body.history.map((h: { move: number | null }) => ({ ...h, move: null })); }
      await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("./t/ADI");
    const card = page.locator(".next-card");
    await expect(card.getByTestId("nc-xcheck")).toBeVisible();
    await expect(card.getByTestId("nc-movesession")).toHaveText(text);
    if (!inferred) await expect(card.locator(".nc-stats dd").nth(2)).toHaveText("—");
    await noSideScroll(page);
    await page.screenshot({ path: test.info().outputPath(`contested-${inferred || "unknown"}.png`) });
  });
}

// 0062: a session the two calendars contest is never headlined as fact.
test("a contested session: the sheet headlines \"Time unconfirmed\" with the unknown glyph and names both", async ({ page }) => {
  await page.route("**/api/ticker/ZZCT", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"ZZCT"'));
    body.next = { ...body.next, date: "2026-11-11", session: "amc", quarter: 4, year: 2026, nasdaq: { date: "2026-11-11", session: "bmo" } };
    body.moveSession = { feed: "amc", nasdaq: "bmo", session: "bmo" };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/ZZCT");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toHaveText("Wednesday, November 11");
  await expect(card.getByTestId("nc-session")).toHaveText(/^Time unconfirmed · in 11 days$/);
  await expect(card).not.toContainText("After close");
  await expect(card.locator(".nc-phase .phase-tbd")).toHaveCount(1);
  await expect(card.locator(".phase-amc, .phase-bmo")).toHaveCount(0);
  await expect(card.getByTestId("nc-xcheck")).toHaveText("Two calendars disagree. Our data feed lists it after the close; Nasdaq's calendar, before the open. Past moves point to before the open. Treat the time as unconfirmed until the company announces it.");
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("contested-sheet.png") });
});

test("a contested session: the grid tile shows the unknown glyph and the drawer names both sessions", async ({ page }) => {
  await page.goto("./?d=2026-11-12");
  const tile = page.locator('.tbtn[title*="(AMAT)"]').first();
  await expect(tile).toBeVisible();
  await expect(tile.locator(".phase-tbd")).toHaveCount(1);
  await expect(tile.locator(".phase-amc")).toHaveCount(0);
  await expect(tile).not.toHaveClass(/tbtn-projected/); // both feeds agree on the date
  await page.goto("./?d=2026-11-12&day=2026-11-12");
  const drawer = page.locator(".drawer[role=dialog]");
  const amat = drawer.locator(".erow", { hasText: "AMAT" });
  await expect(amat.locator(".erow-x")).toHaveText("Feed: after close · Nasdaq: before open");
  expect(await amat.locator(".erow-x").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  // Listed with the unconfirmed times, not under "After close".
  expect(await amat.evaluate((el) => el.closest(".sess")?.querySelector(".sess-head")?.textContent?.trim())).toMatch(/^Time TBD/);
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("contested-drawer.png") });
});

test("a contested session: Hype Check says the time isn't confirmed, with the unknown glyph", async ({ page }) => {
  await page.route("**/api/ticker/NVDA", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json"));
    body.next = { ...body.next, date: "2026-11-04", session: "amc", nasdaq: { date: "2026-11-04", session: "bmo" } };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./check?text=%24NVDA");
  const next = page.locator(".hc-card .hc-facts div", { hasText: "Next report" }).locator("dd");
  await expect(next).toContainText("time not confirmed yet");
  await expect(next).not.toContainText("after the market closes");
  await expect(next.locator(".phase-tbd")).toHaveCount(1);
  await noSideScroll(page);
});
