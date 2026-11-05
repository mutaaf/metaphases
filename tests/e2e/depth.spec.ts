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
