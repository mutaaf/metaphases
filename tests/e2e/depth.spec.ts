import { test, expect } from "./fixtures";

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
