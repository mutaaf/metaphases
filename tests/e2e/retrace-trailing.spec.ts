// 0014: early in a month Retrace grades the last 30 days, so it's never empty in peak season.
import { test, expect } from "./fixtures";

test("on Nov 1 Retrace shows the last 30 days, with October's reports graded", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T12:00:00-05:00"));
  const reads: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/calendar")) reads.push(r.url()); });
  await page.goto("./retrace");
  await expect(page.getByText("Last 30 days · Oct 3 – Nov 1")).toBeVisible();
  await expect(page.getByTestId("retrace-trailing-note")).toContainText("No November reports are in yet");
  await expect(page.getByRole("heading", { name: /no results to grade/i })).toHaveCount(0);
  await expect(page.locator(".big-strip")).toBeVisible();
  await expect(page.locator(".stat").first()).toContainText(/[1-9]\d*/);
  await expect(page.locator(".card").filter({ hasText: "Biggest beats" }).locator(".erow").first()).toBeVisible();
  expect(reads.some((u) => /from=2026-10-03&to=/.test(u))).toBe(true);
  // The arrows still step by month: back to October as a whole month.
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator(".btn-box.label")).toHaveText("October 2026");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByText("Last 30 days · Oct 3 – Nov 1")).toBeVisible();
});

test("a month with 25+ graded reports shows as the month, unchanged", async ({ page }) => {
  await page.goto("./retrace");
  await expect(page.locator(".btn-box.label")).toHaveText("October 2026");
  await expect(page.getByText(/Last 30 days/)).toHaveCount(0);
  await expect(page.getByTestId("retrace-trailing-note")).toHaveCount(0);
});

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`trailing Retrace fits ${vp.width}px with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.clock.setFixedTime(new Date("2026-11-01T12:00:00-05:00"));
    await page.goto("./retrace");
    await expect(page.getByText("Last 30 days · Oct 3 – Nov 1")).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`retrace-trailing-${vp.width}.png`), fullPage: false });
  });
}

test("a failed chunk is named as partial, and never read as 'no reports yet'", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00-05:00"));
  await page.route("**/api/calendar**", (r) => {
    const to = new URL(r.request().url()).searchParams.get("to") ?? "";
    if (to >= "2026-11-02") return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "down" }) });
    return r.fallback();
  });
  await page.goto("./retrace");
  await expect(page.getByText(/Last 30 days · Oct 5 – Nov 3/)).toBeVisible();
  await expect(page.getByText(/Partial: \d+ trading days? didn't load/)).toBeVisible();
  await expect(page.getByTestId("retrace-trailing-note")).toContainText("Fewer than 25 November reports have loaded");
  await expect(page.getByTestId("retrace-trailing-note")).not.toContainText("No November reports");
});
