// 0042: the week brief ranks and labels market value in dollars (Toyota's ¥36T cap headed it as "$36.44T").
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
const row = (s: string, d: string, h: string) => ({ s, d, h, q: 3, y: 2026, eE: 1, eA: null, rE: null, rA: null, t: 1 });
const FOREIGN = [row("TM", "2026-11-05", "bmo"), row("SONY", "2026-11-05", "bmo"), row("SQM", "2026-11-04", "amc")];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    const body = fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json");
    if (to < "2026-11-07") body.events = body.events.filter((e: any) => !FOREIGN.some((f) => f.s === e.s)).concat(FOREIGN);
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("the brief's biggest reporters are ranked in dollars: Apple first, Toyota and Sony (~$228B, ~$146B) below the top five", async ({ page, isMobile }) => {
  await page.goto("/");
  const brief = page.locator(".brief");
  if (isMobile) await brief.locator(".brief-head").click();
  const cos = brief.locator(".brief-co");
  await expect(cos).toHaveCount(5);
  await expect(cos.first()).toContainText("AAPL");
  // In yen they read "$36.44T" and "$23.32T" and ranked first and second; in dollars AMD, PLTR and AMGN outrank them.
  await expect(cos.filter({ hasText: /Toyota|Sony|Sociedad/ })).toHaveCount(0);
  await expect(cos.nth(1)).toContainText("AMD");
  await expect(brief).not.toContainText(/\$(36|23)\.\d\dT/);
});

test("the sheet header gives SQM's value in dollars, not its peso figure labelled USD", async ({ page }) => {
  const nvda = fx("ticker-NVDA.json");
  await page.route("**/api/ticker/SQM", (r) => {
    const d = JSON.parse(JSON.stringify(nvda).replaceAll('"NVDA"', '"SQM"'));
    d.profile = { ...d.profile, name: "Sociedad Quimica y Minera de Chile SA", marketCap: 15130410.04, currency: "USD", exchange: "SANTIAGO STOCK EXCHANGE" };
    r.fulfill({ contentType: "application/json", body: JSON.stringify(d) });
  });
  await page.goto("./?t=SQM");
  const id = page.locator(".sheet .sheet-id .eyebrow");
  await expect(id).toContainText(/· \$16\.3B$/);
  await expect(id).not.toContainText(/\$15\.\d+T/);
});
