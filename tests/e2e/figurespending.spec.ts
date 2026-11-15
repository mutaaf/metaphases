import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0040: a report whose session is over with no figures in reads "Figures pending", not "After close", and
// carries no beat/miss tint. Clock frozen at Sat 2026-10-31 15:00 ET; ZPND is a made-up Friday amc row.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");
const DAY = "2026-10-30";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    if (to >= "2026-11-07") return r.fulfill({ contentType: "application/json", body: fx("calendar-2026-11.json") });
    const body = JSON.parse(fx("calendar-2026-10.json"));
    // An existing universe symbol so it has a grid tile; its own Oct 30 row (if any) is replaced.
    body.events = body.events.filter((e: { s: string }) => e.s !== "ADM");
    body.events.push({ s: "ADM", d: DAY, h: "amc", q: 3, y: 2026, eE: 1.84, eA: null, rE: 22e9, rA: null, t: 1 });
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`drawer at ${size.width}: a passed session with no figures says "Figures pending", untinted`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`./?d=${DAY}&day=${DAY}`);
    const drawer = page.locator(".drawer[role=dialog]");
    const row = drawer.locator(".erow", { hasText: "ADM" });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("figures-pending")).toHaveText("Figures pending");
    // The pending chip replaces the row's usual label; it's the only chip, and it carries no beat/miss tint.
    await expect(row.locator(".erow-res .chip")).toHaveCount(1);
    await expect(row.locator("[class*='res-']")).toHaveCount(0);
    // Neither the page nor the drawer scrolls sideways, and the chip stays inside its row.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await drawer.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(0);
    const [rb, cb] = [await row.boundingBox(), await row.getByTestId("figures-pending").boundingBox()];
    expect(cb!.x + cb!.width).toBeLessThanOrEqual(rb!.x + rb!.width + 0.5);
    await page.screenshot({ path: test.info().outputPath(`figurespending-drawer-${size.width}.png`) });
  });
}

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) test(`the month tile at ${size.width} names it as figures pending, not upcoming`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.goto(`./?d=${DAY}`);
  const tile = page.locator(".tbtn[aria-label*='Archer']").first();
  await expect(tile).toHaveAttribute("aria-label", /figures pending/);
  await expect(tile).not.toHaveAttribute("aria-label", /upcoming/);
  await expect(tile).not.toHaveClass(/res-/);
});
