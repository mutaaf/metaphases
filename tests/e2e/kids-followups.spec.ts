// Metaphases Kids follow-ups: weekly recap (0027), Family League (0028), printable worksheets (0029).
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { decodeLeague, encodeLeague } from "../../shared/kidsWeek";
import { LESSONS } from "../../shared/kidsContent";

const seed = (page: Page, state: object) =>
  page.addInitScript((s) => { try { localStorage.setItem("metaphases:kids:v1", JSON.stringify(s)); } catch {} }, state);

async function passGate(page: Page) {
  const gate = page.getByRole("dialog", { name: "For grown-ups" });
  const q = await gate.locator(".k-gate-q").textContent();
  const [a, b] = (q ?? "").match(/\d+/g)!.map(Number);
  await gate.getByRole("textbox").fill(String(a * b));
  await gate.getByRole("button", { name: "Continue" }).click();
}

const WEEK = {
  guesses: [
    { s: "AAPL", d: "2026-10-29", pick: "beat", at: "2026-10-27", result: "right" },
    { s: "DIS", d: "2026-11-12", pick: "miss", at: "2026-10-30" },
  ],
  lessons: ["share"], lessonDates: { share: "2026-10-28" }, seenBadges: ["first-guess", "good-guess", "first-lesson", "piggy"],
  piggy: { started: "2026-10-20", holdings: [{ s: "DIS", coins: 1000, shares: 10, start: 100 }], history: { "2026-10-20": 1000, "2026-10-26": 1000, "2026-10-30": 1014 } },
};

test.describe("Kids follow-ups", () => {
  test.use({ lens: "kids" });

  test("0027: Saturday opens with the weekly recap; sharing is behind the grown-up gate and sends counts only", async ({ page }) => {
    await seed(page, WEEK);
    const shots: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/og/story/kids-recap.png")) shots.push(r.url()); });
    await page.goto("./kids");
    const card = page.locator(".k-story");
    await expect(card).toContainText("This week in the Moon Club");
    await expect(card).toContainText("You made 2 guesses.");
    await expect(card).toContainText("You got 1 right!");
    await expect(card).toContainText("went up 1.4%");
    await expect(card.getByRole("button", { name: /read this out loud/i })).toBeVisible();
    expect(shots).toEqual([]); // no network for the recap itself
    await card.getByRole("button", { name: /Show a grown-up/ }).click();
    await expect(page.getByRole("dialog", { name: "For grown-ups" })).toBeVisible();
    expect(shots).toEqual([]); // still nothing before the gate
    await passGate(page);
    const share = page.getByRole("dialog", { name: /Their week, as a picture/ });
    await expect(share.locator("img.k-share-img")).toBeVisible();
    expect(shots).toHaveLength(1);
    const q = new URL(shots[0]).searchParams;
    expect([...q.keys()].sort()).toEqual(["g", "l", "lv", "p", "r"]);
    expect(Object.fromEntries(q)).toEqual({ g: "2", r: "1", l: "1", lv: expect.any(String), p: "1.4" });
    await share.getByRole("button", { name: "Close" }).click();
    await expect(card).toContainText("This week in the Moon Club"); // closing doesn't turn the card
  });

  test("0027: no recap when nothing happened this week", async ({ page }) => {
    await page.goto("./kids");
    await expect(page.locator(".k-story")).toContainText("Market weather");
    await expect(page.locator(".k-story-recap")).toHaveCount(0);
  });

  test("0029: worksheets are reachable only through the gate, have no app chrome and print on one page", async ({ page, browserName }, info) => {
    await page.goto("./kids/school/share/print");
    await expect(page.getByRole("dialog", { name: "For grown-ups" })).toBeVisible();
    await passGate(page);
    const sheet = page.locator(".k-sheet");
    await expect(sheet).toContainText("What is a share?");
    await expect(sheet).toContainText("If you own a share of a company, you own");
    await expect(sheet).toContainText("Where do people buy and sell shares?");
    await expect(sheet.getByLabel("Answer key")).toContainText("A tiny piece of it");
    await expect(page.locator(".k-tabbar, .k-top, .tabbar, .top")).toHaveCount(0);
    expect(await page.locator("a[href]").count()).toBe(0);
    if (browserName === "chromium" && info.project.name === "desktop") {
      for (const [id, fmt] of [["share", "Letter"], ["prices", "A4"], ["needs", "Letter"], ["baskets", "A4"]] as const) {
        await page.evaluate((p) => { history.pushState(null, "", p); dispatchEvent(new PopStateEvent("popstate")); }, `/metaphases/kids/school/${id}/print`);
        await expect(sheet).toBeVisible();
        const pdf = (await page.pdf({ format: fmt })).toString("latin1");
        expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length, `${id} on ${fmt}`).toBe(1);
      }
    }
  });

  test("0029: the grown-up corner lists a worksheet per lesson", async ({ page }) => {
    await page.goto("./kids");
    await page.getByRole("button", { name: "For grown-ups" }).click();
    await passGate(page);
    await expect(page.locator(".k-sheets li")).toHaveCount(LESSONS.length);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth) - (screen.width < 500 ? 390 : innerWidth)), "grown-up corner overflows the phone").toBeLessThanOrEqual(1);
    await page.locator(".k-sheets button", { hasText: "Why do prices go up and down?" }).click();
    await expect(page).toHaveURL(/\/kids\/school\/prices\/print$/);
    await expect(page.locator(".k-sheet h1")).toContainText("Why do prices go up and down?");
  });

  test("0028: export a code, import a sibling's code, compare on the Guess page — no network", async ({ page }) => {
    await seed(page, { guesses: [{ s: "AAPL", d: "2026-11-02", pick: "beat", at: "2026-10-30" }], lessons: [], seenBadges: ["first-guess"], piggy: null });
    await page.goto("./kids");
    await page.getByRole("button", { name: "For grown-ups" }).click();
    await passGate(page);
    await page.getByRole("radio", { name: "Rocket" }).click();
    const mine = await page.getByLabel("This player's league code").inputValue();
    const dec = decodeLeague(mine);
    expect(dec.ok && dec.player).toEqual({ emoji: 1, guesses: [{ s: "AAPL", d: "2026-11-02", pick: "beat" }] });

    const posts: string[] = [];
    page.on("request", (r) => { if (r.method() !== "GET") posts.push(r.url()); });
    await page.getByLabel(/Paste a code/).fill("MOON-NOPE");
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(page.locator(".k-league-setup [role=alert]")).toContainText(/code/i);
    const sib = encodeLeague({ emoji: 4, guesses: [{ s: "AAPL", d: "2026-11-02", pick: "miss" }, { s: "DIS", d: "2026-11-12", pick: "beat" }] });
    await page.getByLabel(/Paste a code/).fill(sib);
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(page.locator(".k-league-setup [role=status]")).toContainText("Unicorn joined with 2 guesses");
    await page.getByRole("button", { name: "Back to kids" }).click();
    await page.locator(".k-tabbar a", { hasText: "Guess" }).click();
    const board = page.getByRole("region", { name: "Family league" });
    await expect(board).toBeVisible();
    await expect(board.locator("thead")).toContainText("🚀");
    await expect(board.locator("thead")).toContainText("🦄");
    await expect(board.locator("tbody tr")).toHaveCount(2);
    await expect(board.locator("tbody tr", { hasText: "Apple" }).locator("td").first()).toHaveAttribute("aria-label", /beat, waiting/);
    expect(posts).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
