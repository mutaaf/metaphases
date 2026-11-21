// 0049: an EPS actual on another basis from its estimate (REIT FFO vs GAAP EPS) is never a "+377%" beat.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
// UDR-shaped: Finnhub's GAAP estimate $0.14 against FFO $0.65, Nasdaq's FFO consensus $0.64 → +1.6%.
// CPT-shaped: GAAP $0.5319 against Core FFO $1.71, no Nasdaq figure → not comparable (it would have led Biggest beats at +221%).
const UDR = { s: "UDR", d: "2026-10-28", h: "amc", q: 3, y: 2026, eE: 0.14, eA: 0.65, nE: 0.64, rE: null, rA: null, t: 1 };
const CPT = { s: "CPT", d: "2026-10-29", h: "amc", q: 3, y: 2026, eE: 0.5319, eA: 1.71, rE: null, rA: null, t: 1 };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    const body = fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json");
    if (to < "2026-11-07") body.events.push(UDR, CPT);
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("a basis mix isn't in Retrace's biggest beats, and is counted as can't compare", async ({ page }) => {
  await page.goto("./retrace");
  const lists = page.locator(".two-col .card").nth(1);
  await expect(lists.locator(".erow").first()).toBeVisible();
  await expect(lists.locator(".erow", { hasText: "CPT" })).toHaveCount(0);
  await expect(page.locator("[data-testid=eps-excluded]")).toContainText(/\d+ can't compare/);
  // No entry in either list claims a surprise beyond ±100% (Nasdaq-judged UDR is +2%).
  const chips = await lists.locator(".erow-res .chip").allTextContents();
  for (const c of chips) { const m = /(-?\d+)%/.exec(c.replace("−", "-")); if (m) expect(Math.abs(+m[1])).toBeLessThanOrEqual(100); }
});

test("the day drawer says the EPS basis differs instead of a result", async ({ page }) => {
  await page.goto("./?d=2026-10-29&day=2026-10-29");
  const row = page.locator("[role=dialog] .erow", { hasText: "CPT" }).first();
  await expect(row.locator("[data-testid=eps-basis]")).toHaveText(/basis differs/i);
  await expect(row.locator(".chip.res-beat, .chip.res-miss, .chip.res-mixed")).toHaveCount(0);
  await page.goto("./?d=2026-10-28&day=2026-10-28");
  await expect(page.locator("[role=dialog] .erow", { hasText: "UDR" }).first().locator(".chip.res-beat")).toContainText("+2%");
});

test("a REIT's sheet: no GAAP EPS estimate as the bar, and a basis-mix quarter has no surprise", async ({ page }) => {
  await page.route("**/api/ticker/UDR", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"UDR"'));
    body.next = { ...body.next, epsE: 0.14, epsBasis: "ffo" };
    body.history = [{ ...body.history[0], epsE: 0.5319, epsA: 1.71, surprisePct: null, basis: "differs" }, ...body.history.slice(1)];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/UDR");
  const card = page.locator(".next-card");
  await expect(card.locator("[data-testid=nc-ffo]")).toContainText("FFO");
  await expect(card.locator(".nc-stats dd").first()).toHaveText("—");
  await expect(page.locator("[data-testid=rx-epsbasis]")).toBeVisible();
  await expect(page.locator(".rx-table tbody tr").first()).toContainText("basis differs");
});

// 0094: a same-source turnaround is a judged beat in words; a non-REIT's "basis differs" note never names FFO or ADRs.
test("a US retailer's sheet: a turnaround reads 'turned a profit', and its basis note is plain", async ({ page }) => {
  await page.route("**/api/ticker/KSS", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"KSS"'));
    body.profile = { ...body.profile, name: "Kohl's Corporation", country: "US" };
    body.history = [
      { ...body.history[0], epsE: 2.35, epsA: 4.95, surprisePct: null, basis: "differs" },
      { ...body.history[1], epsE: -0.19, epsA: 0.1, surprisePct: null },
      ...body.history.slice(2),
    ];
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/KSS");
  const rows = page.locator(".rx-table tbody tr");
  await expect(rows.nth(1)).toContainText("turned a profit");
  await expect(rows.nth(1).locator("td.pos")).toHaveCount(1);
  const note = page.locator("[data-testid=rx-epsbasis]");
  await expect(note).toContainText("different measures");
  await expect(note).not.toContainText("FFO");
  await expect(note).not.toContainText("ADR");
});

// 0096: a GAAP-style Nasdaq record beside an adjusted next estimate (CRWD): one judged quarter, the rest "basis differs",
// and the table's note doesn't claim those rows are adjusted EPS.
test("a software sheet: the adjusted quarter is a beat, the GAAP-style rows read 'basis differs', and the note says 'the other actuals'", async ({ page }) => {
  await page.route("**/api/ticker/CRWD", async (r) => {
    const body = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8").replaceAll('"NVDA"', '"CRWD"'));
    body.profile = { ...body.profile, name: "CrowdStrike Holdings", country: "US" };
    body.next = { ...body.next, epsE: 0.3176 };
    const [a, b, c, d] = body.history;
    body.history = [
      { ...a, epsE: 0.29, epsA: 0.31, surprisePct: 6.9 },
      { ...b, epsE: 0.03, epsA: 0.04, surprisePct: null, basis: "differs" },
      { ...c, epsE: 0.05, epsA: 0.06, surprisePct: null, basis: "differs" },
      { ...d, epsE: 0.02, epsA: 0, surprisePct: null, basis: "differs" },
    ];
    body.beatRate = { beats: 1, total: 1 };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/CRWD");
  const rows = page.locator(".rx-table tbody tr");
  await expect(rows.first()).toContainText("+6.9%");
  await expect(rows.nth(1)).toContainText("basis differs");
  await expect(page.locator(".rx-table")).not.toContainText("missed");
  await expect(page.locator(".rx-basis", { hasText: "adjusted EPS" })).toContainText("The other actuals are usually");
  const wide = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth)));
  expect(wide).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.locator(".rx-table").scrollIntoViewIfNeeded();
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/crwd-${test.info().project.name}.png` });
});
