// Learn by doing: Luna's Lemonade Stand and tap-a-word, for kids who don't know what a share is yet.
import { test, expect } from "./fixtures";

test.describe("Kids: learn by doing", () => {
  test.use({ lens: "kids" });

  test("a new kid sees 'Start here' and can play the whole lemonade stand quest", async ({ page }) => {
    await page.goto("./kids");
    await page.getByRole("button", { name: /Run Luna's Lemonade Stand/ }).click();
    await expect(page).toHaveURL(/\/kids\/start$/);
    await page.getByRole("button", { name: /Let's go/ }).click();

    // 1. Company: sell 10 cups → $6 profit.
    const cup = page.getByRole("button", { name: /Sell a cup of lemonade/ });
    for (let i = 0; i < 10; i++) await cup.click();
    await expect(page.locator(".k-ledger-profit")).toContainText("$6.00");
    await expect(page.locator(".k-speech")).toContainText("That is your profit!");
    await page.getByRole("button", { name: /cut it into shares/ }).click();

    // 2. Shares: sell 3 slices to friends.
    for (const f of ["Bear", "Bunny", "Frog"]) await page.getByRole("button", { name: `Sell ${f} a share for $5` }).click();
    await expect(page.locator(".k-speech")).toContainText("Each slice is called a share");
    await expect(page.getByRole("img", { name: /You own 1, friends own 3/ })).toBeVisible();
    await page.getByRole("button", { name: /watch the price/ }).click();

    // 3. Price: buyers push it to $8, sellers to $4.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /A buyer wants it/ }).click();
    await expect(page.locator(".k-price")).toContainText("$8");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /A seller wants out/ }).click();
    await expect(page.locator(".k-goals .done")).toHaveCount(2);
    await page.getByRole("button", { name: /report card day/ }).click();

    // 4. Report card: guess, open, BEAT.
    await page.getByRole("button", { name: "Beat 👍" }).click();
    await page.getByRole("button", { name: /Open the report card/ }).click();
    await expect(page.locator(".k-reportcard")).toContainText("You guessed right!");
    await page.getByRole("button", { name: /Finish the quest/ }).click();
    await expect(page.locator(".k-celebrate")).toContainText("Lemonade Boss!");
    await expect(page.locator(".k-toast")).toContainText("Lemonade Boss");
    await expect(page.locator(".k-level")).toContainText("15 pts");

    // Done: the banner goes away.
    await page.goto("./kids");
    await expect(page.locator(".k-starthere")).toHaveCount(0);
  });

  test("tap a word on a card to see what it means, then jump into the matching part of the quest", async ({ page }) => {
    await page.goto("./kids");
    const card = page.locator(".k-story");
    await expect(card).toContainText("Market weather");
    await card.getByRole("button", { name: "Share: what does it mean?" }).click();
    const word = page.getByRole("dialog", { name: "Share" });
    await expect(word).toContainText("A tiny slice of a company");
    await word.getByRole("button", { name: "Got it!" }).click();
    await expect(word).toHaveCount(0);
    await expect(card).toContainText("Market weather"); // closing didn't turn the card

    await page.goto("./kids/guess");
    await page.locator(".k-intro").getByRole("button", { name: "Profit: what does it mean?" }).click();
    await page.getByRole("dialog", { name: "Profit" }).getByRole("button", { name: /Play it/ }).click();
    await expect(page).toHaveURL(/\/kids\/start\?step=company$/);
    await expect(page.getByRole("button", { name: /Sell a cup of lemonade/ })).toBeVisible();
  });

  test("the quest fits a phone with no links out", async ({ page }) => {
    await page.goto("./kids/start?step=shares");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    const external = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href).filter((h) => new URL(h).origin !== location.origin));
    expect(external).toEqual([]);
  });
});
