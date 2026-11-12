// 0058: a beat is judged with an estimate and an actual from the same source (Lumentum, Apollo: misses shown as beats).
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
// Finnhub's actual against Nasdaq's pre-report estimate (pr: "n"), with Nasdaq's own actual for that quarter (nA).
const APO = { s: "APO", d: "2026-10-28", h: "bmo", q: 3, y: 2026, eE: 2.04, eA: 2.07, nA: 1.82, pr: "n", rE: null, rA: null, t: 1 };
// LITE-shaped with the gap widened so the mixed pair would rank among Biggest beats (+78%); its own pair is a −1.6% miss.
const LITE = { s: "LITE", d: "2026-10-28", h: "amc", q: 1, y: 2027, eE: 3.82, eA: 6.8, nA: 3.76, pr: "n", rE: null, rA: null, t: 1 };
const AMD = { s: "AMD", d: "2026-10-28", h: "amc", q: 3, y: 2026, eE: 1.68, eA: 2.09, nA: 1.84, pr: "n", rE: null, rA: null, t: 1 };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    const body = fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json");
    if (to < "2026-11-07") body.events = body.events.filter((e: any) => !["APO", "AMD", "LITE"].includes(e.s)).concat([APO, AMD, LITE]);
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("the day drawer judges the same-source pair and shows it", async ({ page }) => {
  await page.goto("./?d=2026-10-28&day=2026-10-28");
  const apo = page.locator("[role=dialog] .erow", { hasText: "APO" }).first();
  await expect(apo.locator(".chip.res-miss")).toContainText("-11%");
  await expect(apo.locator(".chip.res-beat")).toHaveCount(0);
  await expect(apo.locator("[data-testid=nq-actual]")).toContainText("$1.82");
  await expect(apo.locator("[data-testid=nq-actual]")).toHaveAttribute("title", /company's own figure is \$2\.07/);
  const amd = page.locator("[role=dialog] .erow", { hasText: "AMD" }).first();
  await expect(amd.locator(".chip.res-beat")).toContainText("+10%"); // +9.5%, not +24%
});

test("Retrace's biggest beats never lists a miss from a mixed pair", async ({ page }) => {
  await page.goto("./retrace");
  const lists = page.locator(".two-col .card").nth(1);
  await expect(lists.locator(".erow").first()).toBeVisible();
  await expect(lists.locator(".erow", { hasText: "LITE" }).locator(".chip.res-beat")).toHaveCount(0);
  const chips = await lists.locator(".erow", { hasText: "LITE" }).locator(".chip").allTextContents();
  for (const c of chips) expect(c).not.toMatch(/\+78%/);
});
