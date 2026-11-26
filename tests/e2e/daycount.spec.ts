import { test, expect } from "./fixtures";

// 0109: one day, one count. Oct 15 in the recorded fixture has 12 dated rows: 8 popular (t: 1) and 4 the
// "Most popular" filter hides (AA, CMC, MAN, WSE). The drawer header, the day view's sentence and the rows
// you can reach must all agree, and every row is one tap from the drawer.
const DAY = "2026-10-15";

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`Oct 15 drawer at ${size.width}: "8 popular · 12 in all", and the 4 hidden rows one tap away`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`./?d=${DAY}&day=${DAY}`);
    const drawer = page.locator(".drawer[role=dialog]");
    await expect(drawer.getByTestId("day-count")).toHaveText("8 popular · 12 in all");
    const more = drawer.getByTestId("more-reporting");
    await expect(more.locator("summary")).toHaveText("+4 more reporting");
    await expect(more.locator(".erow", { hasText: "MAN" })).toBeHidden();
    await more.locator("summary").click();
    for (const s of ["AA", "CMC", "MAN", "WSE"]) await expect(more.locator(".erow-id b").getByText(s, { exact: true })).toBeVisible();
    await expect(more).toContainText("they have no setup or quality grades");
    // Nothing counted twice: every one of the 12 rows appears exactly once in the drawer.
    await expect(drawer.locator(".erow")).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await more.locator("summary").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/0109-drawer-${size.width}.png` });
  });
}

test("the day view's sentence counts that day, with the same total, and lists the rest", async ({ page }) => {
  await page.goto(`./?d=${DAY}`);
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".page-head .dek")).toContainText("8 popular companies reported on Thursday (12 in all)");
  const more = page.locator(".dayview").getByTestId("more-reporting");
  await expect(more.locator("summary")).toHaveText("+4 more reporting");
  await more.locator("summary").click();
  await expect(more.locator(".erow", { hasText: "CMC" })).toBeVisible();
});

test("Everything shows all 12, with one figure and nothing hidden", async ({ page }) => {
  await page.goto(`./?d=${DAY}&day=${DAY}`);
  await page.locator(".drawer[role=dialog]").getByRole("button", { name: "Close" }).click();
  await page.locator(".filter-btn, button", { hasText: /Most popular/ }).first().click();
  await page.locator(".menu-item", { hasText: "Everything" }).click();
  await page.goto(`./?d=${DAY}&day=${DAY}`);
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.getByTestId("day-count")).toHaveText("12 reporting");
  await expect(drawer.getByTestId("more-reporting")).toHaveCount(0);
});

// Review: a day the filter shows none of, but others report, gives both counts and points to the fold.
test("Oct 7: none popular, one in all; the drawer and the day view agree and the row is reachable", async ({ page }) => {
  await page.goto("./?d=2026-10-07&day=2026-10-07");
  const drawer = page.locator(".drawer[role=dialog]");
  await expect(drawer.getByTestId("day-count")).toHaveText("0 popular · 1 in all");
  await expect(drawer.locator(".drawer-empty")).toContainText("One other company does");
  await drawer.getByTestId("more-reporting").locator("summary").click();
  await expect(drawer.getByTestId("more-reporting").locator(".erow")).toHaveCount(1);
  await drawer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "day view" }).click();
  await expect(page.locator(".page-head .dek")).toContainText("0 popular companies reported on Wednesday (1 in all)");
});
