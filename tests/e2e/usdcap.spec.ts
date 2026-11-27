// 0042: the week brief ranks and labels market value in dollars (Toyota's ¥36T cap headed it as "$36.44T").
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { profileCap } from "../../shared/marketCap";
import { moneyIn } from "../../shared/currency";
import universe from "../../data/universe.json" with { type: "json" };

const U = universe as unknown as Record<string, { mc: number; px?: number; mcAt?: string }>;

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
    // Finnhub's profile gives 15.1T pesos labelled USD; the worker answers with the universe's dollar figure (0042, 0073).
    const raw = { marketCapitalization: 15130410.04, currency: "USD", exchange: "SANTIAGO STOCK EXCHANGE" };
    d.profile = { ...d.profile, name: "Sociedad Quimica y Minera de Chile SA", exchange: raw.exchange, ...profileCap(U.SQM, raw, d.chart) };
    r.fulfill({ contentType: "application/json", body: JSON.stringify(d) });
  });
  await page.goto("./?t=SQM");
  const id = page.locator(".sheet .sheet-id .eyebrow");
  await expect(id).toContainText(new RegExp(`· \\${moneyIn(U.SQM.mc * 1e6, "USD").replace(".", "\\.")}$`));
  await expect(id).toContainText(/· \$\d+(\.\d)?B$/);
  await expect(id).not.toContainText(/\$15\.\d+T/);
});

test("0106: an off-universe ADR's sheet gives Finnhub's dollar cap in dollars (Vipshop $6.2B, not CN¥6.2B)", async ({ page }) => {
  const nio = fx("ticker-NIO.json");
  await page.route("**/api/ticker/VIPS", (r) => {
    const d = JSON.parse(JSON.stringify(nio).replaceAll('"NIO"', '"VIPS"'));
    // The worker's answer: a CNY-reporting company listed in New York, its cap in dollars.
    d.profile = { ...d.profile, name: "Vipshop Holdings Ltd", marketCap: 6185.88, currency: "USD", exchange: "NEW YORK STOCK EXCHANGE, INC." };
    r.fulfill({ contentType: "application/json", body: JSON.stringify(d) });
  });
  await page.goto("./?t=VIPS");
  const id = page.locator(".sheet .sheet-id .eyebrow");
  await expect(id).toContainText(/· \$6\.2B$/);
  await expect(id).not.toContainText("CN¥");
});

test("0073: the sheet header gives the worker's cap at the last close, dated, not the refresh's snapshot", async ({ page }) => {
  const nvda = fx("ticker-NVDA.json");
  await page.route("**/api/ticker/NVDA", (r) => {
    // NVDA a fortnight after a refresh taken at $203: the worker scales $4.93T to the $162.85 close.
    const d = JSON.parse(JSON.stringify(nvda));
    d.profile = { ...d.profile, marketCap: 3956578, currency: "USD", capAt: "2026-11-13" };
    r.fulfill({ contentType: "application/json", body: JSON.stringify(d) });
  });
  await page.goto("./?t=NVDA");
  const id = page.locator(".sheet .sheet-id .eyebrow");
  await expect(id).toContainText(/· \$3\.96T$/);
  await expect(id).not.toContainText("4.93T");
  await expect(id.locator(".sheet-cap")).toHaveAttribute("title", "Market value at the Fri, Nov 13 close");
});
