// Metaphases Kids — the Market Moon Club. Phone first (390×844), then desktop.
import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures";

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

test.describe("Metaphases Kids", () => {
  test.use({ lens: "kids" });

  test("a first visit can choose 'learning with our kid' and lands in the kids shell", async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("metaphases:v1", JSON.stringify({ prefs: { lens: "unset" } })); } catch {} });
    await page.goto("./");
    await page.getByRole("button", { name: /learning with our kid/i }).click();
    await expect(page).toHaveURL(/\/metaphases\/kids$/);
    await expect(page.getByRole("heading", { name: /Today's Market Story/ })).toBeVisible();
    await expect(page.locator(".k-tabbar")).toBeVisible();
    // No grown-up trader chrome inside kids mode.
    await expect(page.locator(".macro, .top, .tabbar")).toHaveCount(0);
  });

  test("the kids lens opens kids mode from the home page", async ({ page }) => {
    await page.goto("./");
    await expect(page).toHaveURL(/\/kids$/);
  });

  test("story cards: market weather, report cards from companies kids know, read-aloud", async ({ page }) => {
    await page.goto("./kids");
    const card = page.locator(".k-story");
    await expect(card).toContainText("Market weather");
    await expect(card.getByRole("button", { name: /read this out loud/i })).toBeVisible();
    await page.getByRole("button", { name: "Next card" }).click();
    await expect(card).toContainText("Report card day!");
    await expect(card).toContainText("Apple");
    await expect(card).toContainText(/after school/);
    await expect(card).toContainText(/Last time it got its report card/);
  });

  test("guess the report card, then reveal it once the result is out", async ({ page }) => {
    await page.goto("./kids/guess");
    await page.getByRole("button", { name: "Guess Apple will beat" }).click();
    await expect(page.locator(".k-guesses")).toContainText("You guessed BEAT");
    await expect(page.locator(".k-guesses")).toContainText("Waiting for the report card");
    // The report card arrives: AAPL reported $2.10 against a ~$2.02 estimate.
    const cal = JSON.parse(fx("calendar-2026-11.json"));
    for (const e of cal.events) if (e.s === "AAPL" && e.d === "2026-11-02") { e.eA = 2.1; e.rA = e.rE; }
    await page.route("**/api/calendar**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cal) }));
    await page.reload();
    await page.getByRole("button", { name: /Reveal/ }).click();
    await expect(page.locator(".k-result")).toContainText("You got it right!");
    await expect(page.locator(".k-result")).toContainText("BEAT");
    await expect(page.locator(".k-toast")).toContainText("New badge");
    await expect(page.locator(".k-level")).toContainText(/1[0-9] pts|[2-9][0-9] pts/);
  });

  test("pretend piggy bank: pick 3 companies, split coins, see pretend value", async ({ page }) => {
    await page.goto("./kids/piggy");
    for (const n of ["Disney", "Roblox", "Hershey"]) await page.locator(".k-pickco", { hasText: n }).click();
    await expect(page.locator(".k-split")).toContainText("All your coins are placed!");
    await expect(page.locator(".k-tip").first()).toContainText("3 baskets");
    await page.getByRole("button", { name: /Start my pretend piggy bank/ }).click();
    await expect(page.locator(".k-bank")).toContainText("PRETEND MONEY");
    await expect(page.locator(".k-bank-v")).toContainText("$1,000");
    await expect(page.locator(".k-holdings li")).toHaveCount(3);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("metaphases:kids:v1") || "{}"));
    expect(saved.piggy.holdings).toHaveLength(3);
  });

  test("Moon School: finish a lesson, earn a badge", async ({ page }) => {
    await page.goto("./kids/school");
    await page.getByRole("button", { name: /What is a share\?/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next →" }).click();
    for (let q = 0; q < 2; q++) {
      await page.locator(".k-answer").first().click();
      await page.getByRole("button", { name: /Next →|Finish/ }).click();
    }
    await expect(page.locator(".k-celebrate")).toContainText("Lesson done!");
    await page.getByRole("button", { name: "All lessons" }).click();
    await expect(page.locator(".k-lesson.done")).toHaveCount(1);
    await expect(page.locator(".k-badges li.got")).not.toHaveCount(0);
  });

  test("Ask Luna uses the free brain only, even when a grown-up saved their own key", async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("metaphases:ai:v1", JSON.stringify({ provider: "anthropic", key: "sk-ant-grownup", model: "claude-x", verified: true })); } catch {} });
    const calls: { headers: Record<string, string>; body: any }[] = [];
    await page.route("**/api/ai/stream", async (r) => {
      calls.push({ headers: r.request().headers(), body: r.request().postDataJSON() });
      await r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ t: "A share is a tiny piece of a company!" })}\n\ndata: ${JSON.stringify({ done: true, provider: "edge", model: "m" })}\n\n` });
    });
    await page.goto("./kids/ask");
    await page.getByRole("button", { name: "What is a share?" }).click();
    await expect(page.locator(".k-luna-says")).toContainText("tiny piece of a company");
    expect(calls[0].body.task).toBe("kids");
    expect(calls[0].body.provider).toBe("edge");
    expect(calls[0].headers["x-mp-key"]).toBeUndefined();
  });

  test("the grown-up gate blocks leaving kids mode without the right answer", async ({ page }) => {
    await page.goto("./kids");
    await page.getByRole("button", { name: "For grown-ups" }).click();
    const gate = page.getByRole("dialog", { name: "For grown-ups" });
    await gate.getByRole("textbox").fill("1");
    await gate.getByRole("button", { name: "Continue" }).click();
    await expect(gate).toContainText("That's not it");
    await expect(page).toHaveURL(/\/kids$/);
    const q = await gate.locator(".k-gate-q").textContent();
    const [a, b] = (q ?? "").match(/\d+/g)!.map(Number);
    await gate.getByRole("textbox").fill(String(a * b));
    await gate.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/kids\/grownups$/);
    await expect(page.getByRole("heading", { name: /About Metaphases Kids/ })).toBeVisible();
    await page.getByRole("button", { name: /grown-up Metaphases/ }).click();
    await expect(page).toHaveURL(/\/metaphases\/$/);
  });

  test("no links out of kids mode, and no horizontal scroll", async ({ page }) => {
    for (const p of ["./kids", "./kids/guess", "./kids/piggy", "./kids/school", "./kids/school/hype", "./kids/ask"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const external = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href).filter((h) => new URL(h).origin !== location.origin));
      expect(external, `external links on ${p}`).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
    }
  });
});
