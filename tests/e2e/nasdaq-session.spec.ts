import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0050: a session only Nasdaq's day calendar gives (the feed left it blank) is marked `hs: "n"` by the worker
// (unit-tested in nasdaqSession.test.ts). The client calls it expected, never the company's word.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(0);

test("a grid tile with a Nasdaq-filled session says the time is expected", async ({ page }) => {
  const cal = JSON.parse(fx("calendar-2026-11.json"));
  for (const e of cal.events) if (e.s === "CEG" && e.d === "2026-11-09") Object.assign(e, { h: "bmo", hs: "n", x: "agree", xh: "bmo" });
  await page.route("**/api/calendar**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cal) }));
  await page.goto("./?d=2026-11-09");
  const ceg = page.locator('.tbtn[title*="(CEG)"]').first();
  await expect(ceg).toHaveAttribute("title", /Before open \(expected\)/);
  await expect(ceg).toHaveAttribute("aria-label", /before open \(expected\)/);
});

test("the sheet calls a Nasdaq-filled time expected and says where it's from; a feed time has no note", async ({ page }) => {
  await page.route("**/api/ticker/INTU", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"INTU"'));
    body.next = { ...body.next, date: "2026-11-19", session: "amc", quarter: 1, year: 2027, hs: "n" };
    delete body.next.projected; delete body.next.confirmed; delete body.next.nasdaq;
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/INTU");
  const card = page.locator(".next-card");
  await expect(card.getByTestId("nc-session")).toContainText("After close (expected)");
  await expect(card.getByTestId("nc-expected")).toHaveText("The time is from Nasdaq's calendar; our data feed left it blank and the company hasn't said.");
  await noSideScroll(page);
  await page.screenshot({ path: test.info().outputPath("nasdaq-session-sheet.png") });

  await page.goto("./t/NVDA");
  await expect(page.locator(".next-card").getByTestId("nc-expected")).toHaveCount(0);
  await expect(page.locator(".next-card").getByTestId("nc-session")).not.toContainText("(expected)");
});
