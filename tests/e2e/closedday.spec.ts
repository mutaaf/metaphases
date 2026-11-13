import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0064: rows the feed projects onto Thanksgiving (`c`) are never shown as a dated report. The drawer, the day
// view, the week column and the month cell say "Market closed", don't count them as reporting and file them
// under "Date not confirmed". Clock frozen at 2026-10-31; the November fixture gets two Thanksgiving rows.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");
const HOL = "2026-11-26";
const holRows = [
  { s: "VEEV", d: HOL, h: "amc", q: 3, y: 2027, eE: 2.1, eA: null, rE: 820000000, rA: null, t: 1, c: "Thanksgiving" },
  { s: "MRVL", d: HOL, h: "", q: 3, y: 2027, eE: 1.11, eA: null, rE: 3219504478, rA: null, t: 1, c: "Thanksgiving" },
];

const noSideScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth), document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(0);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    if (to < "2026-11-07") return r.fulfill({ contentType: "application/json", body: fx("calendar-2026-10.json") });
    const body = JSON.parse(fx("calendar-2026-11.json"));
    body.events.push(...holRows);
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`drawer on Thanksgiving at ${size.width}: market closed, rows under "Date not confirmed", no "After close"`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`./?d=${HOL}&day=${HOL}`);
    const drawer = page.locator(".drawer[role=dialog]");
    await expect(drawer.locator(".drawer-head .eyebrow")).toHaveText("Market closed");
    await expect(drawer.locator(".drawer-head .eyebrow")).not.toContainText("reporting");
    await expect(drawer.locator(".sess-head", { hasText: "After close" })).toHaveCount(0);
    const group = drawer.getByTestId("unconfirmed-group");
    await expect(group.locator(".sess-head")).toContainText("Date not confirmed");
    await expect(group.locator(".sess-head .phase-projected")).toHaveCount(1);
    await expect(group).toContainText("Our data feed projects these reports on Thanksgiving, when markets are closed, so they're likely not the real date");
    // 0051's holiday copy holds, softened so it doesn't contradict the rows under it.
    await expect(drawer.locator(".drawer-empty")).toHaveText("Market closed · Thanksgiving. The exchanges are shut, so the dates below aren't confirmed.");
    await expect(group.locator(".erow", { hasText: "VEEV" })).toHaveCount(1);
    await expect(group.locator(".erow", { hasText: "MRVL" })).toHaveCount(1);
    // The generic "projected" note isn't repeated on top of the group's own line.
    await expect(drawer.locator(".notice", { hasText: "projected" })).toHaveCount(0);
    await noSideScroll(page);
    await page.screenshot({ path: test.info().outputPath(`closedday-drawer-${size.width}.png`) });
  });
}

test("the Thanksgiving month cell shows no count; the week column lists the rows only as unconfirmed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?d=${HOL}`);
  const cell = page.locator(".cell.holiday", { hasText: "Thanksgiving" });
  await expect(cell).toContainText("Market closed · Thanksgiving");
  await expect(cell.locator(".cell-count")).toHaveCount(0);
  await page.getByRole("button", { name: "week view" }).click();
  const col = page.locator(".wcol", { hasText: "Thanksgiving" });
  await expect(col).toContainText("Market closed · Thanksgiving");
  await expect(col.locator(".cell-count")).toHaveCount(0);
  await expect(col.locator(".sess-mini", { hasText: "After close" })).toHaveCount(0);
  await expect(col.locator(".sess-mini", { hasText: "Date not confirmed" })).toHaveCount(1);
  await expect(col.locator(".wrow-projected", { hasText: "VEEV" })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("closedday-week-1440.png") });
});

test("the day view on Thanksgiving files the rows under Date not confirmed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./?d=${HOL}`);
  await page.getByRole("button", { name: "day view" }).click();
  const dv = page.locator(".dayview");
  await expect(dv).toContainText("Markets are closed for Thanksgiving");
  await expect(dv.locator(".sess-head", { hasText: "After close" })).toHaveCount(0);
  await expect(dv.getByTestId("unconfirmed-group")).toContainText("VEEV");
  await noSideScroll(page);
});

test("Compass marks a holding's Thanksgiving row as date not confirmed, with no day stated", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const k = "metaphases:v1";
    const cur = JSON.parse(localStorage.getItem(k) || "{}");
    if (!cur.holdings?.length) localStorage.setItem(k, JSON.stringify({ ...cur, holdings: [{ s: "MRVL", v: 5000 }, { s: "AAPL", v: 4000 }] }));
  });
  await page.goto("./compass");
  const row = page.locator(".ex-row", { hasText: "MRVL" });
  await expect(row.getByTestId("ex-unconfirmed")).toContainText("Date not confirmed");
  await expect(row.locator(".ex-date")).not.toContainText("Nov 26");
  // No date, so it sorts after the dated rows and stays out of the week bars.
  await expect(page.locator(".ex-row").last()).toContainText("MRVL");
  await expect(page.locator(".wk-names", { hasText: "MRVL" })).toHaveCount(0);
  await noSideScroll(page);
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({ path: test.info().outputPath("closedday-compass-390.png") });
});

test("a normal trading day next to the holiday keeps its count, session groups and \"N reporting\"", async ({ page }) => {
  await page.goto("./?d=2026-11-02&day=2026-11-02");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".drawer-head .eyebrow")).toHaveText(/^\d+ reporting$/);
  await expect(drawer.locator(".sess-head", { hasText: "After close" })).toHaveCount(1);
  await expect(drawer.getByTestId("unconfirmed-group")).toHaveCount(0);
});

test("the week brief names no day for a Thanksgiving row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./?d=${HOL}`);
  await page.getByRole("button", { name: "week view" }).click();
  const brief = page.locator(".brief-head");
  if ((await brief.getAttribute("aria-expanded")) !== "true") await brief.click();
  await expect(page.locator(".brief-co", { hasText: "MRVL" }).getByTestId("brief-unconfirmed")).toContainText("Date not confirmed");
  await noSideScroll(page);
});
