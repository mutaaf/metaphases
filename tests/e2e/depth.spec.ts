import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

test("the ticker sheet charts a year of prices with every report marked", async ({ page }) => {
  await page.goto("./t/NVDA");
  const chart = page.locator(".pchart");
  await expect(chart.locator("svg")).toBeVisible();
  await expect(chart.locator(".pc-mark")).toHaveCount(4);
  await expect(chart.locator(".pc-proj")).toBeVisible(); // ± typical move projected into the next report
  await chart.locator(".pc-mark circle").last().click();
  await expect(chart.locator(".pc-detail")).toContainText(/EPS \$[\d.]+ → \$[\d.]+/);
});

test("peers reporting nearby are listed and open their own sheet", async ({ page }) => {
  await page.goto("./t/NVDA");
  const peers = page.locator(".peers .peer");
  await expect(peers.first()).toBeVisible();
  const sym = (await peers.first().locator("> b").innerText()).trim();
  await peers.first().click();
  await expect(page).toHaveURL(new RegExp(`t=${sym}`));
});

test("quarterly trend shows revenue and EPS bars with plain-English legend", async ({ page }) => {
  await page.goto("./t/NVDA");
  const q = page.locator(".qtrend");
  await expect(q.locator(".qt-col")).toHaveCount(8);
  await expect(q).toContainText("Revenue");
  await expect(q).toContainText("vs a year ago");
});

test("calendar subscription links point at the .ics feed", async ({ page }) => {
  await page.goto("./watchlist");
  const sub = page.getByRole("link", { name: /subscribe/i });
  await expect(sub).toHaveAttribute("href", /^webcal:\/\/.+\/metaphases\/api\/ics\?s=AAPL,NVDA,DIS$/);
  await expect(page.getByRole("link", { name: /download \.ics/i })).toHaveAttribute("href", "/metaphases/api/ics?s=AAPL,NVDA,DIS");
  await page.goto("./t/NVDA");
  await expect(page.locator(".sheet .ics-one")).toHaveAttribute("href", "/metaphases/api/ics?s=NVDA");
});

test("Retrace and the macro strip show the earnings-season scoreboard", async ({ page }) => {
  await page.goto("./retrace");
  const s = page.locator(".season");
  await expect(s).toBeVisible();
  await expect(s.locator(".season-stats b").first()).toHaveText(/\d+%/);
  await page.goto("./");
  await expect(page.locator(".season-slim")).toContainText("of the S&P 500 reported");
});

test("a revenue figure on a different basis from its estimate isn't judged (0011)", async ({ page }) => {
  // HIG Oct 26: EPS 3.50 vs 3.21 est (beat); revenue 5.39B vs 7.44B est (−27.6%: a basis mismatch, not a miss).
  await page.goto("./?d=2026-10-26&day=2026-10-26");
  const row = page.locator("[role=dialog] .erow", { hasText: "HIG" }).first();
  const chip = row.locator(".erow-res .chip");
  await expect(chip).toHaveClass(/res-beat/);
  await expect(row.locator(".eps-only")).toHaveText(/EPS only/i);

  await page.goto("./retrace");
  await expect(page.locator(".stat-row .rev-excluded")).toContainText(/\d+ can't compare/);
});

test("a date the company announced itself says so and links its announcement (0013)", async ({ page }) => {
  const src = "https://newsroom.arm.com/news/arm-announces-earnings-release-date-for-second-quarter-fiscal-year-ending-2027";
  // The worker applies data/date-overrides.json (unit-tested); here the sheet gets its output shape.
  await page.route("**/api/ticker/ARM", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"ARM"'));
    body.next = { ...body.next, date: "2026-11-04", session: "amc", quarter: 2, confirmed: src };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/ARM");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toContainText("November 4");
  await expect(card.locator(".nc-confirmed")).toContainText("Confirmed by the company");
  await expect(card.locator(".nc-confirmed a")).toHaveAttribute("href", src);
  const w = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(w).toBeLessThanOrEqual(0);
});

test("a projected date on a market holiday reads as not confirmed, never as a plain date (0045)", async ({ page }) => {
  await page.route("**/api/ticker/MRVL", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"MRVL"'));
    body.next = { ...body.next, date: "2026-11-26", session: "", quarter: 3, year: 2027, closed: "Thanksgiving" };
    delete body.next.confirmed;
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/MRVL");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toHaveText("Date not confirmed");
  await expect(card.locator(".nc-closed")).toContainText("markets are closed that day (Thanksgiving)");
  await expect(card).not.toContainText(/in \d+ days|today|tomorrow/);
  const w = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(w).toBeLessThanOrEqual(0);
});

test("the sheet shows no company-confirmed label for a feed date", async ({ page }) => {
  await page.goto("./t/NVDA");
  await expect(page.locator(".next-card h3")).toBeVisible();
  await expect(page.locator(".nc-confirmed")).toHaveCount(0);
});

test("an unreported quarter reads as not confirmed, never as the quarter after it (0038)", async ({ page }) => {
  // The worker keeps the unreported quarter as `next` (unit-tested); here the sheet gets its output shape.
  await page.route("**/api/ticker/AXON", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"AXON"'));
    body.next = { ...body.next, date: "2026-10-27", session: "", quarter: 3, year: 2026, epsE: 1.87, overdue: true };
    delete body.next.confirmed;
    body.read = ["Axon's Q3 report date is not confirmed yet: the data feed expected it on Tuesday, Oct 27 and has no results yet.", ...body.read.slice(1)];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/AXON");
  const card = page.locator(".next-card");
  await expect(card.locator("h3")).toHaveText("Date not confirmed");
  await expect(card.locator(".eyebrow").first()).toContainText("Q3 2026");
  await expect(card.locator(".nc-closed")).toContainText("expected it on Tuesday, October 27");
  await expect(card).not.toContainText(/in \d+ days|today|tomorrow/);
  await expect(page.locator(".pc-proj")).toHaveCount(0); // no "typical move into <date>" band
  await expect(page.locator(".sheet-actions")).not.toContainText(/calendar/i);
  const w = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(w).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("overdue-sheet.png") });
});

test("a calendar row whose day passed with no figures says so, untinted (0038)", async ({ page }) => {
  await page.goto("./?d=2026-10-21&day=2026-10-21");
  const drawer = page.locator(".drawer[role=dialog]");
  const bkr = drawer.locator(".erow", { hasText: "BKR" });
  await expect(bkr.locator(".chip-nores")).toHaveText(/No figures yet/i);
  await expect(bkr.locator(".res-beat, .res-miss, .res-mixed")).toHaveCount(0);
  await bkr.screenshot({ path: test.info().outputPath("overdue-calendar.png") });
});

// 0039: the worker decides reported / results-pending (unit-tested in reportedToday.test.ts); here the sheet gets its output shape.
const nvdaAs = (sym: string) => JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', JSON.stringify(sym)));

test("a report that's out today shows the actual and beat, with no preview button (0039)", async ({ page }) => {
  await page.route("**/api/ticker/PFE", async (r) => {
    const body = nvdaAs("PFE");
    body.justReported = { date: "2026-10-31", session: "bmo", quarter: 3, year: 2026, epsE: 0.73, epsA: 0.87, currency: "USD" };
    body.history = [{ date: "2026-10-31", session: "bmo", period: "Q3 2026", epsE: 0.73, epsA: 0.87, surprisePct: 19.18, move: null }, ...body.history];
    body.next = { ...body.next, date: "2027-02-02", session: "bmo", quarter: 4, year: 2026 };
    body.read = ["PFE reported Q3 today (Saturday, Oct 31) before the opening bell: $0.87 a share against $0.73 expected, a beat of 19%."];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/PFE");
  const just = page.locator(".just-reported");
  await expect(just).toContainText("Just reported · Q3 2026");
  await expect(just).toContainText("$0.87");
  await expect(just).toContainText("Beat by 19%");
  await expect(page.locator(".next-card .eyebrow").first()).toContainText("Next report · Q4 2026");
  await expect(page.getByRole("button", { name: /Write the preview/ })).toHaveCount(0);
  const w = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(w).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/0039-reported-${test.info().project.name}.png` });
});

test("a report whose session passed without figures says results are due, never 'expects' (0039)", async ({ page }) => {
  await page.route("**/api/ticker/CVS", async (r) => {
    const body = nvdaAs("CVS");
    body.next = { ...body.next, date: "2026-10-31", session: "bmo", quarter: 3, year: 2026, epsE: 1.67, status: "results-pending" };
    body.read = ["CVS's Q3 results were expected before the opening bell today (Saturday, Oct 31); none are in our data yet.", "The estimate going in was $1.67 a share."];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/CVS");
  const card = page.locator(".next-card");
  await expect(card.locator(".eyebrow").first()).toContainText("This report · Q3 2026");
  await expect(card).toContainText("Results were expected before open today. None are in our data yet.");
  await expect(card).not.toContainText("expects");
  await expect(card).not.toContainText("· today");
  await expect(page.getByRole("button", { name: /Write the preview/ })).toHaveCount(0);
  await page.screenshot({ path: `test-results/0039-pending-${test.info().project.name}.png` });
});

// 0046: the worker scales Berkshire's Class A figures to the B share and labels Finnhub-only quarters by quarter
// (unit-tested in shareClass.test.ts); here the sheet gets its output shape.
test("BRK.B: B-share EPS, and quarters with no known report day read as quarters, not dates (0046)", async ({ page }) => {
  await page.route("**/api/ticker/BRK.B", async (r) => {
    const body = nvdaAs("BRK.B");
    body.profile = { ...body.profile, name: "Berkshire Hathaway Inc" };
    body.next = { date: "2027-02-26", session: "", quarter: 4, year: 2026, epsE: 5.4686, revE: 99243363400, currency: "USD" };
    body.history = [
      { date: "2026-11-07", session: "bmo", period: "Q3 2026", epsE: 6.1692, epsA: 5.9397, surprisePct: -3.72, move: null },
      { date: "Q2 2026", session: "", period: "Q2 2026", epsE: 5.063, epsA: 6.0255, surprisePct: 19.01, move: null },
      { date: "Q1 2026", session: "", period: "Q1 2026", epsE: 5.3857, epsA: 5.2596, surprisePct: -2.34, move: null },
      { date: "Q4 2025", session: "", period: "Q4 2025", epsE: 5.6212, epsA: 4.7288, surprisePct: -15.88, move: null },
    ];
    body.read = ["Berkshire Hathaway Inc reports Q4 on Friday, Feb 26 (time not yet confirmed).", "Wall Street expects $5.47 a share, versus $5.94 last quarter."];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/BRK.B");
  await expect(page.locator(".nc-stats").first()).toContainText("$5.47");
  const rows = page.locator(".rx-table tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator("td").first()).toContainText("Nov 7 ’26");
  await expect(rows.nth(1).locator("td").first()).toHaveText(/Q2 2026/);
  const table = await page.locator(".rx-table").innerText();
  expect(table).not.toMatch(/Jun 30|Mar 31|Dec 31/);
  expect(table).not.toMatch(/\$\d,?\d{3}\./);
  const w = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(w).toBeLessThanOrEqual(0);
  await page.locator(".reactions").scrollIntoViewIfNeeded();
  await page.locator(".reactions").screenshot({ path: test.info().outputPath("brk-reactions.png") });
});
