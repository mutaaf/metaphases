// 0026: a failed request is a failed request. It must never read as a fact about the company
// ("double-check the ticker", "too small"), the season (a low "reported %") or the month ("· 0").
import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

const BUSY = { status: 503, contentType: "text/plain", body: "error code: 1102" };

test("Hype Check says the service is busy, not that the ticker is wrong, and Try again recovers", async ({ page }) => {
  let fail = true;
  await page.route("**/api/ticker/AXON", (r) => (fail ? r.fulfill(BUSY) : r.fallback()));
  await page.goto("./check?text=%24AXON");
  const card = page.locator(".hc-card");
  await expect(card).toContainText("Couldn't load AXON right now");
  await expect(card).toContainText("busy");
  await expect(card).not.toContainText("too small");
  await expect(card).not.toContainText("Double-check the ticker");
  fail = false;
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(card.locator(".hc-verdict")).toBeVisible();
  await expect(card.locator(".notice")).toHaveCount(0);
});

test("the season scoreboard is labelled partial when a day of the window didn't load", async ({ page }) => {
  await page.route("**/api/calendar**", (r) => {
    const u = new URL(r.request().url());
    const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "";
    return from <= "2026-10-14" && "2026-10-14" <= to ? r.fulfill(BUSY) : r.fallback();
  });
  await page.goto("./retrace");
  const s = page.locator(".season");
  await expect(s.locator(".season-partial")).toContainText(/Partial: \d+ (trading )?days? didn't load/);
  await expect(s.locator(".season-stats b").first()).toHaveText(/^at least \d+%$/i);
  await page.goto("./");
  await expect(page.locator(".season-slim")).toContainText("partial");
});

test("a complete window shows the season without a partial label", async ({ page }) => {
  const oct = JSON.parse(readFileSync(new URL("../fixtures/calendar-2026-10.json", import.meta.url), "utf8"));
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    return to < "2026-11-07" ? r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...oct, warnings: [] }) }) : r.fallback();
  });
  await page.goto("./retrace");
  const s = page.locator(".season");
  await expect(s.locator(".season-stats b").first()).toHaveText(/^\d+%$/);
  await expect(s.locator(".season-partial")).toHaveCount(0);
});

test("home shows an error with Try again when the calendar fails, never a zero count", async ({ page }) => {
  let fail = true;
  await page.route("**/api/calendar**", (r) => (fail ? r.fulfill(BUSY) : r.fallback()));
  await page.goto("./");
  const err = page.locator(".notice-error");
  await expect(err).toBeVisible({ timeout: 2000 });
  await expect(err.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".page-head")).not.toContainText(/Most popular · 0/i);
  await expect(page.locator(".page-head")).not.toContainText(/quiet stretch|Charting the phases/);
  // A day we know nothing about is unknown, not empty.
  await expect(page.locator(".cell .empty-tag", { hasText: "No earnings" })).toHaveCount(0);
  await expect(page.locator(".cell .unknown-tag").first()).toContainText("Didn't load");
  fail = false;
  await err.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".notice-error")).toHaveCount(0);
  await expect(page.locator(".page-head .dek")).toContainText(/companies report/);
});

test("calendar days that didn't load say so instead of \"No earnings\"", async ({ page }) => {
  // The recorded November fixture couldn't load Nov 26 – Dec 4 (see its warnings).
  await page.goto("./?d=2026-11-30");
  for (const day of [/Nov\s*27/i, /Nov\s*30/i]) {
    const cell = page.locator(".cell", { hasText: day }).first();
    await expect(cell.locator(".unknown-tag")).toContainText("Didn't load");
    await expect(cell).not.toContainText("No earnings");
  }
  // A day that did load and is empty says only that none of ours report (0051).
  const empty = page.locator(".cell", { hasText: /Nov\s*13/i }).first();
  await expect(empty).toContainText("None of the companies we follow");
  await expect(empty).not.toContainText("No earnings");
});

test("an empty trading day never claims nobody reports, and explains what we follow (0051)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?d=2026-11-13");
  const empty = page.locator(".cell", { hasText: /Nov\s*13/i }).first();
  await expect(empty.locator(".empty-tag")).toHaveText(/None of the companies we follow/i);
  await empty.getByRole("button", { name: /None of the companies we follow/i }).click();
  await expect(empty.locator(".term-pop")).toContainText("S&P 500");
  // The tag fits its cell: no horizontal scroll at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".dayview")).toContainText("None of the companies we follow report on Friday");
  await expect(page.locator(".dayview")).not.toContainText("No earnings");
});

test("week and day views also say a failed day didn't load, and the notice counts days, not warnings", async ({ page }) => {
  await page.goto("./?d=2026-11-30");
  await expect(page.locator(".notice-warn").first()).toContainText(/\d+ days didn't load yet|didn't load yet/);
  await expect(page.locator(".notice-warn").first()).not.toContainText(/3\d days/);
  await page.getByRole("button", { name: "week view" }).click();
  const col = page.locator(".wcol").first();
  await expect(col.locator(".unknown-tag")).toContainText("Didn't load");
  await expect(col.locator(".cell-count")).toHaveCount(0);
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".dayview")).toContainText("didn't load");
  await expect(page.locator(".dayview")).not.toContainText("No earnings");
});

test("a pending overseas check is not a failure: no 'busy' notice and no retries when every response is 200 (0047)", async ({ page }) => {
  const read = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
  const oct = read("calendar-2026-10.json"), nov = read("calendar-2026-11.json");
  const urls: string[] = [];
  await page.route("**/api/calendar**", (r) => {
    urls.push(r.request().url());
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    const body = { ...(to < "2026-11-07" ? oct : nov), warnings: [], pending: 12 };
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator(".page-head .dek")).toContainText(/companies report/);
  await page.waitForTimeout(5000); // past the first quiet retry (4 s) a warning would schedule
  await expect(page.locator(".notice-warn")).toHaveCount(0);
  await expect(page.getByText(/service is busy/)).toHaveCount(0);
  await expect(page.getByText(/still being checked/)).toBeVisible();
  expect(urls.filter((u) => u.includes("_r=")).length).toBe(0);
  expect(urls.length).toBeLessThanOrEqual(13);
});

test("a week still loading is unknown, never 'none of ours' from the previous range (0051)", async ({ page }) => {
  await page.addInitScript(() => { try { const k = "metaphases:v1"; const cur = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...cur, prefs: { ...(cur.prefs || {}), view: "week" } })); } catch {} });
  await page.goto("./?d=2026-11-02");
  await expect(page.locator(".wcol", { hasText: /Nov\s*06/i })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/calendar**", async (r) => { await gate; await r.fallback(); });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.locator(".empty-none")).toHaveCount(0);
  release();
  await expect(page.locator(".wcol", { hasText: /Nov\s*13/i }).locator(".empty-none")).toContainText("None of the companies we follow");
});

test("with a narrow filter an empty day says so, not that none of ours report (0051)", async ({ page }) => {
  await page.addInitScript(() => { try { const k = "metaphases:v1"; const cur = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...cur, prefs: { ...(cur.prefs || {}), filter: "watch" } })); } catch {} });
  await page.goto("./?d=2026-11-13");
  const cell = page.locator(".cell", { hasText: /Nov\s*13/i }).first();
  await expect(cell.locator(".empty-tag")).toHaveText(/None with these filters/i);
  await expect(cell).not.toContainText("companies we follow");
});

// 0051 bounce 1: the day drawer, opened by its own shareable URL, is never a blank "0 reporting".
for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`an empty day's drawer says none of ours report, not "0 reporting" (0051, ${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("./?day=2026-11-13");
    const drawer = page.locator(".drawer");
    await expect(drawer.locator(".drawer-empty")).toContainText("None of the companies we follow report on Friday");
    await expect(drawer.locator(".eyebrow").first()).toHaveText(/None we follow/i);
    await expect(drawer).not.toContainText(/0 reporting/i);
    await drawer.getByRole("button", { name: /None of the companies we follow/i }).click();
    await expect(drawer.locator(".term-pop")).toContainText("S&P 500");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The drawer keeps a side gutter on a phone: the text never touches the screen edge.
    const box = await drawer.locator(".drawer-empty").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(12);
  });
}

test("a holiday's drawer says the market is closed, not a blank (0051)", async ({ page }) => {
  await page.goto("./?day=2026-11-26");
  const drawer = page.locator(".drawer");
  await expect(drawer.locator(".eyebrow").first()).toHaveText(/Market closed/i);
  await expect(drawer.locator(".drawer-empty")).toContainText("Market closed · Thanksgiving");
  await expect(drawer).not.toContainText(/0 reporting|companies we follow/i);
});

test("an empty day's drawer under a narrow filter says so, not none of ours (0051)", async ({ page }) => {
  await page.addInitScript(() => { try { const k = "metaphases:v1"; const cur = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...cur, prefs: { ...(cur.prefs || {}), filter: "watch" } })); } catch {} });
  await page.goto("./?day=2026-11-13");
  await expect(page.locator(".drawer .drawer-empty")).toContainText("None with these filters");
  await expect(page.locator(".drawer")).not.toContainText(/0 reporting|companies we follow/i);
});

test("a day drawer whose calendar failed says it didn't load, never none of ours (0051)", async ({ page }) => {
  await page.route("**/api/calendar**", (r) => r.fulfill(BUSY));
  await page.goto("./?day=2026-11-13");
  const drawer = page.locator(".drawer");
  await expect(drawer.locator(".drawer-empty")).toContainText(/didn't load/i);
  await expect(drawer).not.toContainText(/0 reporting|companies we follow/i);
});
