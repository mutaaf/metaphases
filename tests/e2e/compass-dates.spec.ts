import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0070: Compass marks a date the way the calendar does. Clock frozen at Sat Oct 31, 2026.
// AXON Nov 2 has no session (projected); AMAT Nov 12 is contested (Nasdaq says Thu Nov 12 before the open, here
// moved to Fri Nov 13 so the row names another day); CEG Nov 9 carries a company override (`o`), so it's firm
// even with no session; AAPL Nov 2 after close is a dated session inside three weeks. ZZNQ isn't in our universe.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.beforeEach(async ({ page }) => {
  const cal = JSON.parse(fx("calendar-2026-11.json"));
  for (const e of cal.events) {
    if (e.s === "AMAT" && e.d === "2026-11-12") Object.assign(e, { x: "differs", xd: "2026-11-13", xh: "bmo" });
    if (e.s === "CEG" && e.d === "2026-11-09") Object.assign(e, { o: "https://example.com/ceg-release" });
  }
  cal.events.push({ s: "ZZNQ", d: "2026-11-18", h: "amc", q: 3, y: 2026, eE: 0.5, eA: null, rE: null, rA: null, t: 0 });
  await page.route("**/api/calendar**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cal) }));
  await page.addInitScript(() => {
    const k = "metaphases:v1";
    const cur = JSON.parse(localStorage.getItem(k) || "{}");
    if (!cur.holdings?.length) localStorage.setItem(k, JSON.stringify({ ...cur, holdings: [{ s: "AXON", v: 2000 }, { s: "AMAT", v: 3000 }, { s: "CEG", v: 1500 }, { s: "AAPL", v: 4000 }, { s: "ZZNQ", v: 1000 }] }));
  });
});

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  test(`Compass marks projected and Nasdaq-disputed dates, not firm ones (${w}×${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("./compass");
    const row = (s: string) => page.locator(".ex-row", { has: page.locator(".erow-id b", { hasText: new RegExp(`^${s}$`) }) });
    await expect(row("AXON").getByTestId("ex-proj")).toHaveText("Projected date");
    await expect(row("AXON").locator(".ex-date .phase-projected")).toHaveCount(1);
    await expect(row("AMAT").getByTestId("ex-x")).toHaveText("Nasdaq: Fri, Nov 13, before open");
    await expect(row("AMAT").getByTestId("ex-proj")).toHaveCount(0);
    for (const s of ["CEG", "AAPL", "ZZNQ"]) {
      await expect(row(s)).toHaveCount(1);
      await expect(row(s).getByTestId("ex-proj")).toHaveCount(0);
      await expect(row(s).getByTestId("ex-x")).toHaveCount(0);
    }
    // One note explains both marks above the list.
    await expect(page.getByTestId("ex-notes")).toContainText("One date here isn't confirmed: Nasdaq's calendar lists it on another day or time");
    await expect(page.getByTestId("ex-notes")).toContainText("One date here is projected");
    // A company we don't follow has no name to show, so its ticker appears once.
    await expect(row("ZZNQ").locator(".erow-id")).toHaveText("ZZNQ");
    await expect(row("AAPL").locator(".ex-name")).toHaveText("Apple Inc.");
    for (const s of ["AXON", "AMAT", "CEG"]) await expect(row(s).locator(".ex-name")).toHaveCount(1);
    await noSideScroll(page);
    const label = row("AMAT").getByTestId("ex-x");
    expect(await label.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await page.locator(".ex-row").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`compass-dates-${w}.png`), fullPage: true });
  });
}
