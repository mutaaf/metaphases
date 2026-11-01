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

export const test = base.extend<{ lens: "trader" | "everyday" | "unset" }>({
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
    // Logos come from a third-party CDN; keep tests hermetic.
    await page.route("https://static2.finnhub.io/**", (r) => r.fulfill({ status: 404, body: "" }));
    await use(page);
  },
});
export { expect };
