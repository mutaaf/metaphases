// Every e2e test runs against recorded API responses and a frozen clock (Sat Oct 31 2026, 3 PM ET),
// so CI needs no API keys and results are deterministic. Refresh: scripts/record-fixtures.sh
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date("2026-10-31T15:00:00-04:00"));
    await page.route("**/api/macro", (r) => r.fulfill({ contentType: "application/json", body: fx("macro.json") }));
    await page.route("**/api/calendar**", (r) => {
      const to = new URL(r.request().url()).searchParams.get("to") ?? "";
      r.fulfill({ contentType: "application/json", body: fx(to < "2026-11-07" ? "calendar-2026-10.json" : "calendar-2026-11.json") });
    });
    await page.route("**/api/ticker/*", (r) => {
      const sym = r.request().url().split("/").pop()!.toUpperCase();
      r.fulfill({ contentType: "application/json", body: fx("ticker-NVDA.json").replaceAll('"NVDA"', JSON.stringify(sym)) });
    });
    // Logos come from a third-party CDN; keep tests hermetic.
    await page.route("https://static2.finnhub.io/**", (r) => r.fulfill({ status: 404, body: "" }));
    await use(page);
  },
});
export { expect };
