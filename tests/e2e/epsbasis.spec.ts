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
