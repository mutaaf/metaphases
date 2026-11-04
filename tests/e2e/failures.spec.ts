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
  // A day that did load and is empty still says so plainly.
  await expect(page.locator(".cell", { hasText: /Nov\s*13/i }).first()).toContainText("No earnings");
});
