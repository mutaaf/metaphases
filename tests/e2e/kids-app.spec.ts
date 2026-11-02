// /kids/app leads to the native Moon Club app; the download link stays behind the grown-up gate.
import { test, expect } from "./fixtures";
import { isAppleAppLink, MOON_CLUB_APP } from "../../shared/kidsApp";

test.describe("Moon Club app page", () => {
  test.use({ lens: "kids" });

  test("the story page nudges to the app, and the link only shows after the grown-up gate", async ({ page }) => {
    await page.goto("./kids");
    await page.getByRole("link", { name: /Moon Club is on iPhone & iPad/ }).click();
    await expect(page).toHaveURL(/\/kids\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("in your pocket");
    // No link out before the gate.
    await expect(page.locator('a[href^="https://"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Get the app" }).click();
    const gate = page.getByRole("dialog", { name: "For grown-ups" });
    const q = await gate.locator(".k-gate-q").textContent();
    const [a, b] = (q ?? "").match(/\d+/g)!.map(Number);
    await gate.getByRole("textbox").fill(String(a * b));
    await gate.getByRole("button", { name: "Continue" }).click();
    if (MOON_CLUB_APP.testflight || MOON_CLUB_APP.appStore) {
      const out = page.locator('a[href^="https://"]');
      await expect(out).toHaveCount(1);
      expect(isAppleAppLink(await out.getAttribute("href"))).toBe(true);
    } else {
      await expect(page.getByTestId("app-soon")).toBeVisible();
    }
  });

  test("fits a phone with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./kids/app");
    await expect(page.getByRole("button", { name: "Get the app" })).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
