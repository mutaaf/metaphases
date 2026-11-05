// 0025: shared deep links render first; the "How do you invest?" picker never covers them.
import { test, expect } from "./fixtures";

const picker = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: /how do you invest/i });
const lens = (page: import("@playwright/test").Page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("metaphases:v1") || "{}").prefs?.lens ?? "unset"; } catch { return "unset"; } });

test.describe("deep links on a first visit", () => {
  test.use({ lens: "unset", reducedMotion: "reduce" });

  for (const path of ["./t/WES", "./t/QCOM", "./?t=UBER"]) {
    test(`${path} opens the sheet with no picker`, async ({ page }) => {
      await page.goto(path);
      const sym = path.split(/[/=]/).pop()!;
      const sheet = page.locator(".sheet[role=dialog]");
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(sym);
      await page.waitForTimeout(3000);
      await expect(picker(page)).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("t")).toBe(sym);
      await expect(page.locator(".app")).toHaveClass(/lens-everyday/);
    });
  }

  test("/check?text=$UBER shows the Hype Check result with no picker", async ({ page }) => {
    await page.goto("./check?text=%24UBER");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main")).toContainText("UBER");
    await page.waitForTimeout(3000);
    await expect(picker(page)).toHaveCount(0);
  });

  test("/today shows the stories with no picker, and its lens switch sets the lens and persists", async ({ page }) => {
    await page.goto("./today");
    await expect(page.locator(".story")).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(picker(page)).toHaveCount(0);
    await expect(page.locator(".lens-note")).toHaveCount(0); // Today carries its own "Viewing as" switch
    await page.locator("main .lens-switch").getByRole("button", { name: "Trader" }).click();
    expect(await lens(page)).toBe("trader");
    await page.reload();
    await expect(page.locator(".app")).toHaveClass(/lens-trader/);
    await expect(picker(page)).toHaveCount(0);
  });

  test("dismissing the inline note keeps plain English", async ({ page }) => {
    await page.goto("./t/WES");
    await expect(page.locator(".lens-note")).toHaveCount(1); // only in the sheet, which covers the page
    const note = page.locator(".sheet .lens-note");
    await note.getByRole("button", { name: /keep plain english/i }).click();
    await expect(note).toHaveCount(0);
    expect(await lens(page)).toBe("everyday");
    await expect(page.locator(".sheet[role=dialog]")).toBeVisible();
  });
});

test.describe("the picker on a plain first visit", () => {
  test.use({ lens: "unset", reducedMotion: "reduce" });

  test("has a visible close button ≥ 40px that leaves the lens on Everyday", async ({ page }) => {
    await page.goto("./");
    await expect(picker(page)).toBeVisible();
    const close = picker(page).getByRole("button", { name: /close/i });
    await expect(close).toBeVisible();
    const b = (await close.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
    await close.click();
    await expect(picker(page)).toHaveCount(0);
    expect(await lens(page)).toBe("everyday");
  });

  // The picker is open and a sheet opens under it (e.g. an in-app link to ?t=).
  const sheetUnderPicker = async (page: import("@playwright/test").Page) => {
    await page.goto("./");
    await expect(picker(page)).toBeVisible();
    await page.evaluate(() => { history.pushState(null, "", location.pathname + "?t=WES"); dispatchEvent(new PopStateEvent("popstate")); });
    await expect(page.locator(".sheet[role=dialog]")).toBeAttached();
  };

  test("Esc closes the picker only, never the sheet underneath", async ({ page }) => {
    await sheetUnderPicker(page);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
    await expect(page.locator(".sheet[role=dialog]")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("t")).toBe("WES");
    expect(await lens(page)).toBe("everyday");
    // Focus moves into the sheet that is now on top, and Tab stays inside it.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".sheet"))).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".sheet"))).toBe(true);
  });

  test("the search hotkey waits until the picker is answered", async ({ page }) => {
    await page.goto("./");
    await expect(picker(page)).toBeVisible();
    await page.keyboard.press("/");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });

  test("choosing 'I invest for the long run' keeps the sheet that's open (phone too)", async ({ page }) => {
    await sheetUnderPicker(page);
    await picker(page).getByText("I invest for the long run").click();
    await expect(picker(page)).toHaveCount(0);
    await expect(page.locator(".sheet[role=dialog]")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("t")).toBe("WES");
  });
});
