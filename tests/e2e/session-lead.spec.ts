import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0104: the feed says after close, Nasdaq before open on the same day, and every recent report moved on Nasdaq's
// session: the worker leads with Nasdaq's (`hs: "n"`) and names the feed's (`feedSession` on the sheet, `fh` on the
// row). Unit-tested in sessionLead0104.test.ts; here, how it reads at 390×844 and 1440×900.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");
const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(0);

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`${vp.width}: the sheet leads with Nasdaq's expected time and names the feed's`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.route("**/api/ticker/INTU", async (r) => {
      const body = JSON.parse(fx("ticker-NVDA.json").replaceAll('"NVDA"', '"INTU"'));
      body.next = { ...body.next, date: "2026-11-19", session: "bmo", quarter: 1, year: 2027, hs: "n", feedSession: "amc" };
      delete body.next.projected; delete body.next.confirmed; delete body.next.nasdaq;
      await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("./t/INTU");
    const card = page.locator(".next-card");
    await expect(card.getByTestId("nc-session")).toContainText("Before open (expected)");
    await expect(card.getByTestId("nc-session")).not.toContainText("unconfirmed");
    await expect(card.getByTestId("nc-feed-session")).toHaveText("The time is from Nasdaq's calendar, and the stock's moves after its recent reports all fit it. Our data feed says after the close; the company hasn't said.");
    await expect(card.getByTestId("nc-expected")).toHaveCount(0);
    await noSideScroll(page);
    await page.screenshot({ path: test.info().outputPath(`session-lead-sheet-${vp.width}.png`) });
  });

  test(`${vp.width}: the day drawer lists it under Before open with the feed's time named`, async ({ page }) => {
    await page.setViewportSize(vp);
    const cal = JSON.parse(fx("calendar-2026-11.json"));
    for (const e of cal.events) if (e.s === "CEG" && e.d === "2026-11-09") Object.assign(e, { h: "bmo", hs: "n", fh: "amc", x: "differs", xd: "2026-11-09", xh: "bmo" });
    await page.route("**/api/calendar**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cal) }));
    await page.goto("./?d=2026-11-09&day=2026-11-09");
    const drawer = page.locator(".drawer[role=dialog]");
    const row = drawer.locator(".erow", { hasText: "CEG" }).first();
    await expect(row).toContainText("Feed: after close · Nasdaq: before open");
    await expect(page.locator('.tbtn[title*="(CEG)"]').first()).toHaveAttribute("title", /Before open \(expected\)/);
    await noSideScroll(page);
    await page.screenshot({ path: test.info().outputPath(`session-lead-drawer-${vp.width}.png`) });
  });
}
