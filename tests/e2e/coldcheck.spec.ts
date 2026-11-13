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
  let seen = new Set<string>();
  await page.route("**/api/calendar**", (r) => {
    const u = r.request().url();
    reads.push(u);
    // A URL's first read is cold; a re-read (`_r`) or a later read of the same URL has been checked.
    const isCold = !/[?&]_r=/.test(u) && !seen.has(u);
    seen.add(u);
    r.fulfill({ contentType: "application/json", body: JSON.stringify(isCold ? cold : warm) });
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
  seen = new Set(); // a fresh page load: its first read is cold again
  await page.goto("./?d=2026-11-02&day=2026-11-02");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.locator(".sess-head", { hasText: "Checking time…" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.clock.runFor(41_000);
  await expect(note).toHaveCount(0);
  expect(reads.some((u) => /from=2026-11-02&to=2026-11-06&_r=1/.test(u))).toBe(true);
  // AXON's session came in with the re-read: it now sits under "After close" on Monday.
  await expect(page.locator(".wcol").first().locator(".wsess", { hasText: "After close" }).locator(".wrow", { hasText: "AXON" })).toBeVisible();
  // Going to next week and back never replays the cold answer from memory.
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.locator(".wcol").first().locator(".wsess", { hasText: "After close" }).locator(".wrow", { hasText: "AXON" })).toBeVisible();
  await expect(note).toHaveCount(0);
});

test("when the re-reads run out, it says the check didn't happen instead of still checking", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-31T15:00:00-04:00") });
  const cold = JSON.parse(fx("calendar-2026-11.json"));
  cold.warnings = [];
  cold.uncheckedDays = ["2026-11-02"];
  const reads: string[] = [];
  await page.route("**/api/calendar**", (r) => { reads.push(r.request().url()); r.fulfill({ contentType: "application/json", body: JSON.stringify(cold) }); });
  await page.goto("./?d=2026-11-02");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".notice", { hasText: "Still comparing Monday's dates and times" })).toBeVisible();
  // Step the clock until each re-read goes out (a jump could land before the next timer is set).
  const sent = (n: number) => reads.some((u) => u.endsWith(`from=2026-11-02&to=2026-11-06&_r=${n}`));
  for (let i = 1; i <= 8; i++) {
    for (let t = 0; t < 30 && !sent(i); t++) { await page.clock.runFor(5_000); await page.waitForTimeout(20); }
    expect(sent(i), `re-read ${i}`).toBe(true);
  }
  for (let t = 0; t < 20; t++) { await page.clock.runFor(5_000); await page.waitForTimeout(20); }
  expect(reads.some((u) => u.endsWith("_r=9"))).toBe(false); // bounded
  const gave = page.locator(".notice", { hasText: "We couldn't compare Monday's dates and times with Nasdaq's calendar just now" });
  await expect(gave).toBeVisible();
  await expect(page.locator(".notice", { hasText: "Still comparing" })).toHaveCount(0);
  await expect(page.getByText("Checking time…")).toHaveCount(0);
  await gave.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("coldcheck-gaveup.png") });
});

test("a month view's re-read reaches every week chunk, not the browser's copy", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-31T15:00:00-04:00") });
  const cold = JSON.parse(fx("calendar-2026-11.json"));
  cold.warnings = [];
  cold.uncheckedDays = ["2026-11-02"];
  const reads: string[] = [];
  await page.route("**/api/calendar**", (r) => { reads.push(r.request().url()); r.fulfill({ contentType: "application/json", body: JSON.stringify(cold) }); });
  await page.goto("./?d=2026-11-02");
  await page.getByRole("button", { name: "month view" }).click();
  await expect(page.locator(".notice", { hasText: "Still comparing" })).toBeVisible();
  // The month's week chunks (the season scoreboard's earlier chunks share the route but never re-read).
  const from = (u: string) => new URL(u).searchParams.get("from")!;
  const chunks = [...new Set(reads.filter((u) => !/_r=/.test(u) && from(u) >= "2026-11-02").map(from))].sort();
  expect(chunks.length).toBeGreaterThan(1);
  await page.clock.runFor(41_000);
  await expect.poll(() => [...new Set(reads.filter((u) => /[?&]_r=1/.test(u)).map(from))].sort()).toEqual(chunks);
});

test("a fully checked week has no checking line", async ({ page }) => {
  await page.goto("./?d=2026-11-09");
  await page.getByRole("button", { name: "week view" }).click();
  await expect(page.locator(".wcol").first()).toBeVisible();
  await expect(page.locator(".notice", { hasText: "Still comparing" })).toHaveCount(0);
  await expect(page.getByText("Checking time…")).toHaveCount(0);
});
