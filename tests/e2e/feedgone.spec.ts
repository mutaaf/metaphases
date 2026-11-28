import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0118: a past day the data feed has dropped (Finnhub keeps about a month) comes back from the worker as
// "Couldn't load <day> — our data feed no longer has reports from that far back." It must never read as
// "None of the companies we follow report" or "A quiet week", is never retried, and makes the season strip a floor
// that names its coverage date. Clock frozen at 2026-10-31; the week of Oct 5 plays the dropped week.
// Every weekday from the season window's start (today − 42 d) to Oct 9: in production the feed drops everything
// before its horizon, so nothing older survives to be counted (the strip names a date only then).
const GONE: string[] = [];
for (let t = Date.UTC(2026, 8, 14); t <= Date.UTC(2026, 9, 9); t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6) GONE.push(d.toISOString().slice(0, 10)); }
const goneWarning = (d: string) => `Couldn't load ${d} — our data feed no longer has reports from that far back.`;
const reads: string[] = [];
const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));

test.beforeEach(async ({ page }) => {
  reads.length = 0;
  await page.route("**/api/calendar**", async (r) => {
    const u = new URL(r.request().url());
    const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "";
    reads.push(`${from}..${to}`);
    const gone = GONE.filter((d) => d >= from && d <= to);
    const body = fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json");
    // Each chunk gets the whole month fixture, so dropped rows go from every chunk, not just the one they fall in.
    body.events = body.events.filter((e: { d: string }) => !GONE.includes(e.d));
    // Only the dropped days: the recorded fixture's own busy days (0026) would rightly be retried.
    body.warnings = gone.map(goneWarning);
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`a dropped day's view at ${size.width} says the feed doesn't have it, never none or quiet`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("./?d=2026-10-07&view=day");
    const dayBtn = page.getByRole("button", { name: "day view" });
    if (await dayBtn.isVisible()) await dayBtn.click();
    const main = page.locator("main");
    await expect(page.locator(".dayview")).toContainText("Our data feed only keeps about a month of past reports");
    await expect(main).not.toContainText("None of the companies we follow report");
    await expect(main).not.toContainText("A quiet week");
    await expect(main).not.toContainText("the market data service is busy");
    await expect(main.locator(".notice", { hasText: "aren't in our data feed any more" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`feedgone-day-${size.width}.png`) });
  });
}

test("the week brief of a dropped week says it's too far back, not quiet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?d=2026-10-07");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".brief-sum")).toHaveText("Too far back for our data feed");
});

test("the season strip is a floor with its coverage date, and dropped days aren't re-read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const s = page.locator(".season-slim");
  await expect(s).toContainText(/at least \d+%/);
  await expect(s).toContainText(/counting since Oct 12/i);
  await expect(s).not.toContainText("partial");
  await page.waitForTimeout(13_000); // longer than the two quick partial-failure retries (4 s, 8 s)
  const chunk = reads.filter((x) => x.slice(0, 10) <= "2026-10-09");
  expect(new Set(chunk).size).toBe(chunk.length);
  await page.screenshot({ path: test.info().outputPath("feedgone-season-390.png") });
});
