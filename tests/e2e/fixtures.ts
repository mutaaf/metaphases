// Every e2e test runs against recorded API responses and a frozen clock (Sat Oct 31 2026, 3 PM ET),
// so CI needs no API keys and results are deterministic. Refresh: scripts/record-fixtures.sh
//
// `lens` presets the viewer's lens before the app boots: "trader" (default — the full desk the older
// specs were written against), "everyday", or "unset" (a true first visit, shows the lens picker).
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

// 1×1 transparent PNG, stands in for the worker-rendered story cards.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export const test = base.extend<{ lens: "trader" | "everyday" | "kids" | "unset" }>({
  lens: ["trader", { option: true }],
  page: async ({ page, lens }, use) => {
    await page.clock.setFixedTime(new Date("2026-10-31T15:00:00-04:00"));
    if (lens !== "unset") {
      await page.addInitScript((l) => {
        try {
          const k = "metaphases:v1";
          const cur = JSON.parse(localStorage.getItem(k) || "{}");
          if (!cur.prefs?.lens) localStorage.setItem(k, JSON.stringify({ ...cur, prefs: { ...(cur.prefs || {}), lens: l } }));
        } catch {}
      }, lens);
    }
    await page.route("**/api/macro", (r) => r.fulfill({ contentType: "application/json", body: fx("macro.json") }));
    await page.route("**/api/calendar**", (r) => {
      const to = new URL(r.request().url()).searchParams.get("to") ?? "";
      r.fulfill({ contentType: "application/json", body: fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json") });
    });
    await page.route("**/api/ticker/*", (r) => {
      const sym = r.request().url().split("/").pop()!.toUpperCase();
      // NIO is recorded on its own (a foreign filer whose estimates are in CNY); everything else reuses NVDA.
      if (sym === "NIO") return r.fulfill({ contentType: "application/json", body: fx("ticker-NIO.json") });
      r.fulfill({ contentType: "application/json", body: fx("ticker-NVDA.json").replaceAll('"NVDA"', JSON.stringify(sym)) });
    });
    await page.route("**/og/story/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
    // Batched live prices (Kids piggy bank): every symbol at $100, up 1.2% today.
    await page.route("**/api/quotes**", (r) => {
      const syms = (new URL(r.request().url()).searchParams.get("s") ?? "").split(",").filter(Boolean);
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ quotes: Object.fromEntries(syms.map((s) => [s, { price: 100, changePct: 1.2, prevClose: 98.8 }])), asOf: "2026-10-31T19:00:00Z", warnings: [] }) });
    });
    // "Why did it move?" clues: a down day with the whole market down too (inputs only; the page runs the engine).
    await page.route("**/api/kids/why**", (r) => {
      const u = new URL(r.request().url()); const s = u.searchParams.get("s") ?? "DIS"; const range = u.searchParams.get("range") ?? "1d";
      const input = { s, nick: s, range, move: range === "1d" ? -2.1 : -3.4, market: range === "1d" ? -1.6 : -2.5, sector: { etf: "RSPC", name: "the TV, games and internet companies", move: range === "1d" ? -2.4 : -3.9 }, report: null, dividend: null, normal: range === "1d" ? 1.4 : 3.2, asOf: "2026-10-30" };
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ input, why: null, warnings: [] }) });
    });
    // Moon Club support form: accepts any non-empty question (the worker's validation is unit-tested).
    await page.route("**/api/kids/support", (r) => {
      const b = r.request().postDataJSON() ?? {};
      if (typeof b.message !== "string" || b.message.trim().length < 5) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Please write your question." }) });
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, id: "8215000000000-abcd1234" }) });
    });
    // Logos come from a third-party CDN; keep tests hermetic.
    await page.route("https://static2.finnhub.io/**", (r) => r.fulfill({ status: 404, body: "" }));
    // 0036: the app runs under the production CSP (vite preview serves shared/csp.ts). Any violation by the app
    // itself fails the test that caused it. Tests that inject a blocked script on purpose opt out.
    await page.addInitScript(() => { (window as any).__cspViolations = []; document.addEventListener("securitypolicyviolation", (e) => (window as any).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    await use(page);
    if (!test.info().annotations.some((a) => a.type === "csp-violation-expected") && !page.isClosed()) {
      const v = await page.evaluate(() => (window as any).__cspViolations ?? []).catch(() => []);
      expect(v, "CSP violations").toEqual([]);
    }
  },
});
export { expect };
