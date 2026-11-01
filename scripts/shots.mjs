#!/usr/bin/env node
// Visual audit: screenshots of every surface at 390×844 and 1440×900, light + dark, against the
// recorded fixtures with the clock frozen at 2026-10-31 (same as e2e). Needs a build + `vite preview`.
//   npx vite build && npx vite preview --port 4199 &  then  node scripts/shots.mjs [outDir] [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const OUT = process.argv[2] ?? "shots";
const BASE = process.argv[3] ?? "http://localhost:4199/metaphases/";
const fx = (n) => readFileSync(new URL(`../tests/fixtures/${n}`, import.meta.url), "utf8");
mkdirSync(OUT, { recursive: true });

const pages = [["home", ""], ["sheet", "?t=NVDA"], ["drawer", "?day=2026-11-04"], ["watchlist", "watchlist"], ["compass", "compass"], ["retrace", "retrace"], ["learn", "learn"], ["about", "about"]];
const browser = await chromium.launch();
for (const [vw, vh, tag] of [[390, 844, "phone"], [1440, 900, "desk"]]) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: tag === "phone" });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date("2026-10-31T15:00:00-04:00"));
    await page.route("**/api/macro", (r) => r.fulfill({ contentType: "application/json", body: fx("macro.json") }));
    await page.route("**/api/calendar**", (r) => {
      const to = new URL(r.request().url()).searchParams.get("to") ?? "";
      r.fulfill({ contentType: "application/json", body: fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json") });
    });
    await page.route("**/api/ticker/*", (r) => {
      const s = r.request().url().split("/").pop().split("?")[0].toUpperCase();
      r.fulfill({ contentType: "application/json", body: fx("ticker-NVDA.json").replaceAll('"NVDA"', JSON.stringify(s)) });
    });
    await page.route("https://static2.finnhub.io/**", (r) => r.fulfill({ status: 404, body: "" }));
    for (const [name, path] of pages) {
      await page.goto(BASE + path);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${tag}-${scheme}-${name}.png`, fullPage: name !== "sheet" && name !== "drawer" });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`wrote ${pages.length * 4} screenshots to ${OUT}/`);
