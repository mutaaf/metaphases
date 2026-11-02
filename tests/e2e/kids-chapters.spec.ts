// Quest chapters 2 and 3: Save or Grow? (saving vs investing) and Your Slice Pays You (dividends).
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const LEMONADE_DONE = { guesses: [], lessons: [], seenBadges: ["lemonade"], piggy: null, quest: ["company", "shares", "price", "report"], questDone: true };
const seed = (page: Page, state: object) =>
  page.addInitScript((s) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("metaphases:kids:v1", JSON.stringify(s)); sessionStorage.setItem("seeded", "1"); } } catch {} }, state);

async function noLinksNoOverflow(page: Page) {
  const external = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href).filter((h) => new URL(h).origin !== location.origin));
  expect(external).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test.describe("Kids quest chapters", () => {
  test.use({ lens: "kids" });

  test("after Chapter 1, /kids/start shows the three chapters and suggests Save or Grow?", async ({ page }) => {
    await seed(page, LEMONADE_DONE);
    await page.goto("./kids");
    await page.getByRole("button", { name: /Next chapter: Save or Grow\?/ }).click();
    await expect(page).toHaveURL(/\/kids\/start\?chapter=save$/);
    await page.goto("./kids/start");
    await expect(page.locator(".k-chapter")).toHaveCount(3);
    await expect(page.locator(".k-chapter.next")).toContainText("Save or Grow?");
    await expect(page.locator(".k-chapter.done")).toContainText("Lemonade Stand");
  });

  test("Chapter 2: savings jar, money tree, sort the cards, quick check → Smart Saver", async ({ page }) => {
    await seed(page, LEMONADE_DONE);
    await page.goto("./kids/start?chapter=save");
    await page.getByRole("button", { name: /Let's go/ }).click();

    // Jar: 5 years at 2%, never down.
    const year = page.getByRole("button", { name: /A year goes by/ });
    for (let i = 0; i < 5; i++) await year.click();
    await expect(page.getByLabel(/Savings jar: \$11\.04 after 5 years/)).toBeVisible();
    await expect(page.locator(".k-speech")).toContainText("That's saving: safe and slow");
    await expect(page.locator(".k-remember")).toContainText("Saving is safe");
    await page.getByRole("button", { name: /Next: The money tree/ }).click();

    // Tree: 10 bumpy years, with a bad year along the way.
    for (let i = 0; i < 3; i++) await year.click();
    await expect(page.locator(".k-speech")).toContainText("A bad year");
    for (let i = 0; i < 7; i++) await year.click();
    await expect(page.locator(".k-tag.tree")).toContainText("$");
    await expect(page.locator(".k-speech")).toContainText("That's investing");
    await page.getByRole("button", { name: /Next: Jar or tree\?/ }).click();

    // Sort: a wrong pick gets a nudge; right picks explain why.
    await page.getByRole("button", { name: "A toy next week: grow a tree" }).click();
    await expect(page.locator(".k-sort li.wrong")).toContainText("Try the other one");
    await page.getByRole("button", { name: "A toy next week: save in the jar" }).click();
    for (const [t, where] of [["College in 10 years", "grow a tree"], ["A birthday gift for Mom this month", "save in the jar"], ["When you're a grown-up", "grow a tree"], ["A new bike next summer", "save in the jar"]]) {
      await page.getByRole("button", { name: `${t}: ${where}` }).click();
    }
    await expect(page.locator(".k-sort li.right")).toHaveCount(5);
    await page.getByRole("button", { name: /Next: Quick check/ }).click();

    // Quick check.
    const check = page.locator(".k-check");
    await check.getByRole("button", { name: "The money tree", exact: true }).click();
    await check.getByRole("button", { name: "In the savings jar", exact: true }).click();
    await expect(page.locator(".k-speech")).toContainText("You got 2 of 2 right");
    await page.getByRole("button", { name: /Finish the chapter/ }).click();
    await expect(page.locator(".k-celebrate")).toContainText("Smart Saver!");
    await expect(page.locator(".k-toast")).toContainText(/Smart Saver|Lemonade/);
    await expect(page.locator(".k-level")).toContainText("30 pts");
    await noLinksNoOverflow(page);
  });

  test("Chapter 3: pay the owners, spend vs replant, real companies, quick check → Dividend Detective", async ({ page }) => {
    await seed(page, LEMONADE_DONE);
    await page.goto("./kids/start?chapter=dividends");
    await page.getByRole("button", { name: /Let's go/ }).click();

    for (const o of ["You", "Bear", "Bunny", "Frog"]) await page.getByRole("button", { name: `Give ${o} a $1 coin` }).click();
    await expect(page.locator(".k-speech")).toContainText("That is a dividend");
    await page.getByRole("button", { name: /Next: Spend or replant\?/ }).click();

    await page.getByRole("button", { name: /Replant it/ }).click();
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: /Next season/ }).click();
    await expect(page.locator(".k-snow-col").first()).toContainText("$24.00");
    await expect(page.locator(".k-snow-col.replant")).toContainText("11.9 slices");
    await expect(page.locator(".k-speech")).toContainText("You guessed right!");
    await page.getByRole("button", { name: /Next: Real companies/ }).click();

    for (const [n, yes] of [["Coca-Cola", true], ["Tesla", false], ["McDonald's", true], ["Roblox", false], ["Hershey", true], ["Netflix", false], ["Walmart", true], ["Amazon", false], ["PepsiCo", true]] as const) {
      await page.getByRole("button", { name: yes ? `${n}: yes, pays a dividend` : `${n}: no dividend` }).click();
    }
    await expect(page.locator(".k-flip.right")).toHaveCount(9);
    await expect(page.locator(".k-flips")).toContainText("Tesla puts its money back in to grow.");
    await page.getByRole("button", { name: /Next: Quick check/ }).click();

    await page.getByRole("button", { name: "Profit shared with the owners" }).click();
    await page.getByRole("button", { name: "More slices" }).click();
    await page.getByRole("button", { name: /Finish the chapter/ }).click();
    await expect(page.locator(".k-celebrate")).toContainText("Dividend Detective!");
    await noLinksNoOverflow(page);
  });

  test("new word cards jump into the matching chapter stage", async ({ page }) => {
    await page.goto("./kids/start?chapter=save&step=jar");
    await page.getByRole("button", { name: "Interest: what does it mean?" }).click();
    const card = page.getByRole("dialog", { name: "Interest" });
    await expect(card).toContainText("extra money the bank pays you");
    await card.getByRole("button", { name: "Got it!" }).click();
    await page.goto("./kids/start?chapter=dividends&step=payout");
    await expect(page.getByRole("button", { name: "Give Bear a $1 coin" })).toBeVisible();
  });
});
