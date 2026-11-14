import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0041: one report, one row. FedEx Freight's Q3 came back from the feed as three rows (Oct 28 with no session,
// and two Oct 29 after-close rows labelled Q3 2026 and Q4 2026). Even if a worker answer still carried them, the
// client's merge (which stitches week-sized chunks, so Oct 28 and Oct 29 can arrive separately) shows one row:
// Oct 29, after the close, with the figures. Clock frozen at 2026-10-31.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");
const row = (d: string, h: string, q: number, y: number, eA: number | null, rA: number | null) =>
  ({ s: "FDXF", d, h, q, y, eE: 1.38, eA, rE: 2419092180, rA, t: 1 });
const twins = [row("2026-10-28", "", 1, 2027, null, null), row("2026-10-29", "amc", 3, 2026, 1.49, 2442000000), row("2026-10-29", "amc", 4, 2026, null, null)];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const u = new URL(r.request().url());
    const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "";
    if (to >= "2026-11-07") return r.fulfill({ contentType: "application/json", body: fx("calendar-2026-11.json") });
    const body = JSON.parse(fx("calendar-2026-10.json"));
    // Twins put in the order that would show the "to come" row if only same-day keys were merged.
    body.events.push(...[twins[2], twins[0], twins[1]].filter((e) => e.d >= from && e.d <= to));
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`FedEx Freight's one report is one row, on Oct 29 with its figures, at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("./?d=2026-10-29&day=2026-10-29");
    const drawer = page.locator(".drawer[role=dialog]");
    const fdxf = drawer.locator(".erow", { hasText: "FDXF" });
    await expect(fdxf).toHaveCount(1);
    await expect(fdxf).toContainText("1.49");
    await page.screenshot({ path: test.info().outputPath(`onerow-oct29-${size.width}.png`) });
    await page.goto("./?d=2026-10-28&day=2026-10-28");
    await expect(page.locator(".drawer[role=dialog]")).toBeVisible();
    await expect(page.locator(".drawer[role=dialog] .erow", { hasText: "FDXF" })).toHaveCount(0);
  });
}
