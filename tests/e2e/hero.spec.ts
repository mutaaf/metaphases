import { test, expect } from "./fixtures";

test.describe("home hero", () => {
  test("first visit shows the full hero; dismiss collapses it to a slim banner that persists", async ({ page }) => {
    await page.goto("./");
    const hero = page.locator(".hero");
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { name: /phase by phase/i })).toBeVisible();
    await expect(hero.locator(".moon-arc")).toBeVisible();
    await expect(hero.locator(".read-key")).toContainText("Before open");
    await hero.getByRole("button", { name: "Dismiss intro" }).click();
    await expect(page.locator(".hero")).toHaveCount(0);
    await expect(page.locator(".hero-slim")).toBeVisible();
    await page.reload();
    await expect(page.locator(".hero")).toHaveCount(0);
    await expect(page.locator(".hero-slim")).toBeVisible();
    await page.getByRole("button", { name: "Show intro" }).click();
    await expect(page.locator(".hero")).toBeVisible();
  });

  test("return visits get the slim banner even without dismissing", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".hero")).toBeVisible();
    await page.reload();
    await expect(page.locator(".hero-slim")).toBeVisible();
  });

  test("See this week scrolls to and pulses the next trading day", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: /see this week/i }).click();
    const next = page.locator(".cell.next");
    await expect(next).toHaveClass(/flash/);
    await expect(next).toBeInViewport();
  });

  test("Map my portfolio opens Compass", async ({ page }) => {
    await page.goto("./");
    await page.locator(".hero").getByRole("button", { name: "Map my portfolio" }).click();
    await expect(page).toHaveURL(/\/metaphases\/compass$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("in phases");
  });

  test("Ask the calendar opens the AI ask panel on this week", async ({ page }) => {
    await page.route("**/api/ai/**", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: "" }));
    await page.goto("./");
    // Desktop: the hero's ghost CTA. Phone: that CTA is hidden in favour of the floating Ask button.
    const heroAsk = page.locator(".hero").getByRole("button", { name: /ask the calendar/i });
    if (await heroAsk.isVisible()) await heroAsk.click();
    else await page.locator(".ask-fab").click();
    await expect(page.locator(".ask-sheet[role=dialog]")).toBeVisible();
    await expect(page).toHaveURL(/\/metaphases\/$/);
  });
});

test.describe("page heroes and empty states", () => {
  test("Watchlist empty state offers a search CTA and one-tap popular chips", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => localStorage.setItem("metaphases:v1", JSON.stringify({ watch: [], holdings: [], prefs: { intro: "seen" } })));
    await page.goto("./watchlist");
    await expect(page.getByRole("heading", { name: /nothing in orbit/i })).toBeVisible();
    await page.getByRole("button", { name: /star your first company/i }).click();
    await expect(page.getByRole("dialog", { name: "Search tickers" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator(".empty-cta").getByRole("button", { name: /NVDA/ }).click();
    await expect(page.locator(".wl-row")).toHaveCount(1);
  });

  test("Compass empty state: sample portfolio and paste-yours CTAs", async ({ page }) => {
    await page.goto("./compass");
    await expect(page.locator(".empty-cta")).toContainText("Money riding on reports");
    await page.locator(".page-hero").getByRole("button", { name: "Paste yours" }).click();
    await expect(page.locator("#holdings-input")).toBeFocused();
    await page.locator(".page-hero").getByRole("button", { name: /sample portfolio/i }).click();
    await expect(page.locator(".ex-row").first()).toBeVisible();
    await expect(page.locator(".empty-cta")).toHaveCount(0);
  });

  test("Retrace jumps to its busiest reported day with the drawer open", async ({ page }) => {
    await page.goto("./retrace");
    await page.getByRole("button", { name: /busiest reported day/i }).click();
    await expect(page).toHaveURL(/\?d=2026-10-\d\d&day=2026-10-\d\d/);
    await expect(page.getByRole("dialog", { name: /Earnings on/ })).toBeVisible();
  });

  test("Learn: Start with EPS lands on the EPS entry", async ({ page }) => {
    await page.goto("./learn");
    await page.getByRole("button", { name: "Start with EPS" }).click();
    await expect(page.locator("#eps")).toBeFocused();
    await expect(page.locator("#eps")).toBeInViewport();
  });

  test("About explains the lineage, the stance and BYOK, with share meta-ready title", async ({ page }) => {
    await page.goto("./about");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("with a memory");
    await expect(page.locator(".lineage li")).toHaveCount(6);
    await expect(page.locator(".stance h4")).toHaveText("Explained, never advice");
    await expect(page.locator(".card h4", { hasText: "Bring your own key" })).toBeVisible();
    await expect(page).toHaveTitle(/Where Metaphases comes from/);
    await expect(page.locator(".nav a", { hasText: "About" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("dialogs and CTAs", () => {
  test("day drawer traps focus, closes on Escape, restores focus, and opens day view", async ({ page }) => {
    await page.goto("./");
    const cell = page.locator(".cell[role=button]").nth(1);
    await cell.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: /Earnings on/ });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    // Tab many times: focus never leaves the drawer.
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(cell).toBeFocused();
    await cell.press("Enter");
    await page.getByRole("button", { name: "Open day view" }).click();
    await expect(page.locator(".dayview")).toBeVisible();
  });

  test("ticker sheet is a modal with watch + share CTAs", async ({ page }) => {
    await page.goto("./?t=NVDA");
    const sheet = page.getByRole("dialog", { name: /earnings/ });
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    const cta = page.locator(".sheet-cta");
    await expect(cta.getByRole("button", { name: /share this read/i })).toBeVisible();
    // NVDA is in the default watchlist; toggle it off and back on from the CTA.
    await cta.getByRole("button", { name: /on your watchlist/i }).click();
    await expect(cta.getByRole("button", { name: /add to watchlist/i })).toBeVisible();
    await cta.getByRole("button", { name: /add to watchlist/i }).click();
    await expect(cta.getByRole("button", { name: /on your watchlist/i })).toBeVisible();
  });

  test("calendar tiles have descriptive accessible names", async ({ page }) => {
    await page.goto("./");
    const name = await page.locator(".tbtn").first().getAttribute("aria-label");
    expect(name).toMatch(/, (before open|during hours|after close|time tbd), (upcoming|beat|mixed|miss)/);
  });

  test("macro strip exports the next 60 days to a calendar file", async ({ page }) => {
    await page.goto("./");
    await page.locator(".macro-row").getByRole("button", { name: /expand/i }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /add these to my calendar/i }).click()]);
    expect(download.suggestedFilename()).toBe("metaphases-economy.ics");
    const path = await download.path();
    const text = (await import("node:fs")).readFileSync(path!, "utf8");
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toMatch(/SUMMARY:Jobs report/);
    expect(text.includes("\r\n")).toBe(true);
  });
});
