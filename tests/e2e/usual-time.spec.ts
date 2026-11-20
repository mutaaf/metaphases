import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0091: a company date with no announced session, where the stock's own past moves settle the company's habit
// (`next.usual`, worker side in usualTime.test.ts), reads "Time not announced · usually after the close", never a bare
// "After close", and shows the notice's call time. Without a settled habit it stays "Time TBD". The glyph stays TBD.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

const sheetFor = (sym: string, next: Record<string, unknown>) => async (r: import("@playwright/test").Route) => {
  const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', `"${sym}"`));
  body.next = { ...body.next, date: "2026-11-24", session: "", quarter: 3, year: 2027, confirmed: "https://example.com/notice", ...next };
  delete body.next.projected; delete body.next.nasdaq; delete body.next.hs;
  await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
};

test("a habit the moves settle reads as a habit, with the company's call time; no habit stays Time TBD", async ({ page }) => {
  await page.route("**/api/ticker/DELL", sheetFor("DELL", { usual: "amc", call: "3:30 p.m. CT" }));
  await page.route("**/api/ticker/ADSK", sheetFor("ADSK", { call: "2 p.m. PT" }));
  await page.goto("./t/DELL");
  const card = page.locator(".next-card");
  await expect(card.getByTestId("nc-session")).toContainText("Time not announced · usually after the close");
  await expect(card.getByTestId("nc-session")).not.toContainText("After close");
  await expect(card.getByTestId("nc-call")).toHaveText("Earnings call 3:30 p.m. CT, per the company's notice");
  await expect(card.locator(".nc-phase .phase")).toHaveClass(/phase-tbd/);
  // Its own line, never run on after "in N days".
  const [sess, call] = await Promise.all([card.getByTestId("nc-session").boundingBox(), card.getByTestId("nc-call").boundingBox()]);
  expect(call!.y).toBeGreaterThanOrEqual(sess!.y + sess!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("usual-time-sheet.png") });

  await page.goto("./t/ADSK");
  await expect(page.locator(".next-card").getByTestId("nc-session")).toContainText("Time TBD");
  await expect(page.locator(".next-card").getByTestId("nc-session")).not.toContainText("usually");
  await expect(page.locator(".next-card").getByTestId("nc-call")).toHaveText("Earnings call 2 p.m. PT, per the company's notice");
});
