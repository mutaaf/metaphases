// The social-first everyday investor (phone first): lens picker, tab bar, Today stories, Hype Check.
import { test, expect } from "./fixtures";

test.describe("first visit", () => {
  test.use({ lens: "unset" });
  test("the lens picker appears; Everyday hides trader jargon in the sheet", async ({ page, isMobile }) => {
    await page.goto("./");
    const pick = page.getByRole("dialog", { name: /how do you invest/i });
    await expect(pick).toBeVisible();
    await pick.getByRole("button", { name: /long run/i }).click();
    await expect(pick).toBeHidden();
    if (isMobile) await expect(page).toHaveURL(/\/today$/);
    await page.goto("./?t=NVDA");
    const sheet = page.locator(".sheet");
    await expect(sheet.locator(".sheet-does")).toContainText("computer chips");
    await expect(sheet.getByText("Setup into the print", { exact: true })).toBeHidden();
    await expect(sheet.locator(".read")).not.toContainText("RSI");
    await sheet.getByRole("button", { name: /show trader details/i }).click();
    await expect(sheet.getByText("Setup into the print", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("metaphases:v1") || "{}").prefs.lens)).toBe("everyday");
  });
  test("choosing Trader keeps the full desk", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: /trade actively/i }).click();
    await page.goto("./?t=NVDA");
    await expect(page.locator(".sheet").getByText("Setup into the print", { exact: true })).toBeVisible();
  });
});

test.describe("everyday", () => {
  test.use({ lens: "everyday" });

  test("phone tab bar navigates Today · Calendar · Hype Check · My Money", async ({ page, isMobile }) => {
    test.skip(!isMobile, "tab bar is phone-only");
    await page.goto("./");
    await expect(page).toHaveURL(/\/today$/); // Everyday on a phone lands on Today
    const bar = page.getByRole("navigation", { name: "Main" });
    await bar.getByRole("link", { name: "Calendar" }).click();
    await expect(page).toHaveURL(/\/metaphases\/$/);
    await expect(page.locator(".grid")).toBeVisible();
    await bar.getByRole("link", { name: "Hype Check" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("socials");
    await bar.getByRole("link", { name: "My Money" }).click();
    await expect(page).toHaveURL(/\/compass$/);
    await bar.getByRole("link", { name: "Today" }).click();
    await expect(page.locator(".story")).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(845);
    for (const a of await bar.getByRole("link").all()) expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("Today stories advance by tap, key and button, and a card shares as an image", async ({ page, isMobile }) => {
    await page.goto("./today");
    const story = page.locator(".story");
    await expect(story).toHaveClass(/story-mood/);
    await expect(story).toContainText("Investors are");
    if (isMobile) {
      const b = (await story.boundingBox())!;
      await story.tap({ position: { x: b.width * 0.8, y: b.height * 0.45 } });
    } else {
      await page.keyboard.press("ArrowRight");
    }
    await expect(story).toHaveClass(/story-report/);
    await expect(story.locator(".st-when")).toContainText("Reports");
    await expect(story.locator(".st-does")).not.toBeEmpty();
    const dl = page.waitForEvent("download");
    await story.getByRole("button", { name: /share this card/i }).click();
    expect((await dl).suggestedFilename()).toMatch(/^metaphases-t-[A-Z]+\.png$/);
    // jump to the last card: the Hype Check CTA
    const tabs = page.getByRole("tab");
    await tabs.last().click();
    await expect(story).toHaveClass(/story-cta/);
    await story.getByRole("button", { name: /check a stock you saw on socials/i }).click();
    await expect(page).toHaveURL(/\/check$/);
  });

  test("Hype Check reads a TikTok caption into two stocks with flags and questions", async ({ page }) => {
    await page.goto("./check");
    await page.getByLabel(/paste a caption/i).fill("Everyone on TikTok is buying $NVDA and Palantir 🚀");
    await page.getByRole("button", { name: "Check it" }).click();
    const cards = page.locator(".hc-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("What it is");
    await expect(cards.first().locator(".hc-verdict")).toBeVisible();
    await expect(cards.first().locator(".hc-flags li, .hc-clean").first()).toBeVisible();
    await expect(cards.first().locator(".hc-q li")).toHaveCount(3);
    await expect(cards.nth(1).getByRole("heading", { level: 3 })).toBeVisible();
    await expect(page.locator(".hc-foot")).toContainText("isn't research");
  });

  test("Hype Check's AI take streams the hype task, grounded", async ({ page }) => {
    let body: { task?: string; context?: { caption?: string; flags?: unknown[] } } = {};
    await page.route("**/api/ai/stream", (r) => { body = r.request().postDataJSON(); r.fulfill({ contentType: "text/event-stream", body: 'data: {"t":"It designs chips. "}\n\ndata: {"t":"A viral post is not research."}\n\ndata: [DONE]\n\n' }); });
    await page.goto("./check?text=%24NVDA");
    await page.locator(".hc-card").getByRole("button", { name: /plain-english take/i }).click();
    await expect(page.locator(".hc-ai")).toContainText("A viral post is not research.");
    expect(body.task).toBe("hype");
    expect(body.context?.caption).toBe("$NVDA");
    expect(Array.isArray(body.context?.flags)).toBe(true);
  });

  test("the share target URL prefills and runs Hype Check", async ({ page }) => {
    await page.goto("./check?title=Look&text=" + encodeURIComponent("Robinhood to the moon") + "&url=" + encodeURIComponent("https://www.tiktok.com/@x/video/1"));
    await expect(page.getByLabel(/paste a caption/i)).toHaveValue(/Robinhood to the moon/);
    await expect(page.locator(".hc-card")).toHaveCount(1);
    await expect(page.locator(".hc-card h3")).toBeVisible();
  });

  test("manifest registers the share target and shortcuts", async ({ request, baseURL }) => {
    const m = await (await request.get(`${baseURL}manifest.webmanifest`)).json();
    expect(m.share_target).toMatchObject({ action: "/metaphases/check", method: "GET", params: { text: "text", url: "url", title: "title" } });
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/metaphases/today", "/metaphases/check"]);
  });

  test("install coach shows once on phones and stays dismissed", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    await page.goto("./check");
    const coach = page.getByRole("complementary", { name: /add to home screen/i });
    await expect(coach).toBeVisible();
    await coach.getByRole("button", { name: "Dismiss" }).click();
    await expect(coach).toBeHidden();
    await page.reload();
    await expect(page.locator(".coach")).toHaveCount(0);
  });

  test("no horizontal scroll on Today and Hype Check", async ({ page }) => {
    for (const p of ["./today", "./check?text=%24NVDA%20%24PLTR"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), p).toBeLessThanOrEqual(1);
    }
  });
});
