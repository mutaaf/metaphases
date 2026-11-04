// Deep links (shared/kidsLinks.ts): with Moon Club installed these URLs open the app; without it they must be
// real pages: the matching /kids content plus the way to the app, no links out before the gate, and gated
// actions (adding a league player) still behind the gate.
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { encodeLeague } from "../../shared/kidsWeek";

const external = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href).filter((h) => new URL(h).origin !== location.origin));
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
async function passGate(page: Page) {
  const gate = page.getByRole("dialog", { name: "For grown-ups" });
  const [a, b] = ((await gate.locator(".k-gate-q").textContent()) ?? "").match(/\d+/g)!.map(Number);
  await gate.getByRole("textbox").fill(String(a * b));
  await gate.getByRole("button", { name: "Continue" }).click();
}

test.describe("Moon Club deep links on the web", () => {
  test.use({ lens: "kids" });

  test("a shared lesson link opens the lesson, with the way to the app carrying its ref", async ({ page }) => {
    await page.goto("./kids/school/money?ref=share");
    await expect(page.locator(".k-main")).toContainText(/money/i);
    const nudge = page.locator(".k-shared-nudge").getByRole("link", { name: /Moon Club is on iPhone & iPad/ });
    await expect(nudge).toBeVisible();
    expect(await external(page)).toEqual([]);
    await nudge.click();
    await expect(page).toHaveURL(/\/kids\/app\?ref=share$/);
    await expect(page.locator('a[href^="https://"]')).toHaveCount(0);
  });

  test("an unknown ref is dropped, and plain pages show no extra nudge", async ({ page }) => {
    await page.goto("./kids/guess?ref=Emma");
    await expect(page.locator(".k-shared-nudge")).toHaveCount(0);
    await page.goto("./kids/guess");
    await expect(page.locator(".k-shared-nudge")).toHaveCount(0);
    await page.goto("./kids/piggy?ref=share");
    await expect(page.locator(".k-shared-nudge")).toHaveCount(1);
  });

  for (const [path, heading, tryHere, lands] of [
    ["gamenight", "two players", "Play Guess the Report Card", /\/kids\/guess$/],
    ["garden", "Garden", "Try the pretend Piggy Bank", /\/kids\/piggy$/],
    ["pack/guest-coach-nova", "Coach Nova's Maker Lab", "Go to Moon School", /\/kids\/school$/],
    ["pack/no-such-pack", "that pack", "Go to Moon School", /\/kids\/school$/],
  ] as const) {
    test(`/kids/${path} explains the app-only feature and points to the web's nearest`, async ({ page }) => {
      await page.goto(`./kids/${path}?ref=share`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
      await expect(page.getByRole("link", { name: /Moon Club is on iPhone & iPad/ })).toHaveAttribute("href", /\/kids\/app\?ref=share$/);
      expect(await external(page)).toEqual([]);
      await noSideScroll(page);
      await page.getByRole("button", { name: tryHere }).click();
      await expect(page).toHaveURL(lands);
    });
  }

  test("a family league link adds the player only after the grown-up gate", async ({ page }) => {
    const code = encodeLeague({ emoji: 4, guesses: [{ s: "AAPL", d: "2026-11-02", pick: "miss" }] });
    await page.goto(`./kids/league/${code}?ref=league`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("invited");
    await expect(page.getByLabel(/Paste a code/)).toHaveCount(0);
    expect(await external(page)).toEqual([]);
    await page.getByRole("button", { name: "Add to our league" }).click();
    await page.getByRole("dialog", { name: "For grown-ups" }).getByRole("button", { name: "Back to kids" }).click();
    await expect(page.getByLabel(/Paste a code/)).toHaveCount(0);
    await page.getByRole("button", { name: "Add to our league" }).click();
    await passGate(page);
    await expect(page.getByLabel(/Paste a code/)).toHaveValue(code);
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(page.locator(".k-league-setup [role=status]")).toContainText("Unicorn joined with 1 guess");
    await noSideScroll(page);
  });

  test("a malformed league or pack link lands on the club's front page", async ({ page }) => {
    await page.goto("./kids/league/%3Cscript%3E");
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("invited");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Market Story");
    await page.goto("./kids/pack/..%2Fcore");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Market Story");
  });

  test("the grown-up corner has no partner picks while the list is empty", async ({ page }) => {
    await page.goto("./kids/grownups");
    await passGate(page);
    await expect(page.getByRole("heading", { name: "Share with another parent" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Grown-up picks" })).toHaveCount(0);
    await expect(page.locator("a[rel~=sponsored]")).toHaveCount(0);
  });
});
