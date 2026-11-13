import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0061: the first calendar read after a quiet spell can come back before the Nasdaq cross-check has run for the
// days on screen (`uncheckedDays`). The week says so, a blank session reads "Checking time…" rather than a settled
// "Time TBD", and the calendar quietly asks again until the days are in (the worker side is in crossCheck.test.ts).
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

test("a cold week says it's still checking, then fills in on a quiet re-read", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-31T15:00:00-04:00") });
  const cold = JSON.parse(fx("calendar-2026-11.json"));
  cold.warnings = [];
  cold.uncheckedDays = ["2026-11-02", "2026-11-03"];
  const warm = JSON.parse(fx("calendar-2026-11.json"));
  warm.warnings = [];
  for (const e of warm.events) if (e.s === "AXON" && e.d === "2026-11-02") Object.assign(e, { h: "amc", x: "agree", xh: "amc" });
  const reads: string[] = [];
  await page.route("**/api/calendar**", (r) => {
    reads.push(r.request().url());
    // The first read of the week is cold; any re-read (`_r`) has been checked.
    r.fulfill({ contentType: "application/json", body: JSON.stringify(/[?&]_r=/.test(r.request().url()) ? warm : cold) });
  });
  await page.goto("./?d=2026-11-02");
  await page.getByRole("button", { name: "week view" }).click();
  const note = page.locator(".notice", { hasText: "Still comparing" });
  await expect(note).toContainText("Still comparing 2 days' dates and times with Nasdaq's calendar.");
  // Not a failure: no "busy" warning.
  await expect(page.locator(".notice", { hasText: "busy" })).toHaveCount(0);
  const mon = page.locator(".wcol").first();
  await expect(mon.locator(".sess-mini", { hasText: "Checking time…" })).toBeVisible();
  await expect(mon.locator(".sess-mini", { hasText: "Time TBD" })).toHaveCount(0);
  // A day the check has reached keeps its plain label.
  await expect(page.locator(".wcol").nth(2).locator(".sess-mini", { hasText: "Checking time…" })).toHaveCount(0);
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("coldcheck-week.png") });

  // The drawer for a checking day says the same.
  await page.goto("./?d=2026-11-02&day=2026-11-02");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".sess-head", { hasText: "Checking time…" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.clock.runFor(31_000);
  await expect(note).toHaveCount(0);
  expect(reads.some((u) => /[?&]_r=1/.test(u))).toBe(true);
  // AXON's session came in with the re-read: it now sits under "After close" on Monday.
  await expect(page.locator(".wcol").first().locator(".wsess", { hasText: "After close" }).locator(".wrow", { hasText: "AXON" })).toBeVisible();
});

test("a fully checked week has no checking line", async ({ page }) => {
  await page.goto("./?d=2026-11-09");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".wcol").first()).toBeVisible();
  await expect(page.locator(".notice", { hasText: "Still comparing" })).toHaveCount(0);
  await expect(page.getByText("Checking time…")).toHaveCount(0);
});
