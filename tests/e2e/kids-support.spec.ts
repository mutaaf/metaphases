// /kids/support is Moon Club's App Store Support URL (Guideline 1.5): a real help page with a working contact form.
import { test, expect } from "./fixtures";

test.describe("Moon Club help & support", () => {
  test.use({ lens: "kids" });

  test("renders the FAQ and sends a question through the contact form", async ({ page }) => {
    await page.goto("./kids/support");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("help & support");
    await expect(page).toHaveTitle(/Moon Club help & support/);
    await expect(page.locator(".k-support")).toContainText("Mutaaf Aziz");
    await expect(page.locator(".k-support")).toContainText("iOS / iPadOS 17 or later");
    // FAQ answers open on tap.
    await page.getByText("How do we reset progress and start over?").click();
    await expect(page.locator("#faq-reset")).toContainText("Reset all progress");
    // No links out of kids mode.
    await expect(page.locator(".k-support a[href^='http']")).toHaveCount(0);
    await expect(page.locator(".k-support a[href^='mailto']")).toHaveCount(0);

    const form = page.getByRole("form", { name: "Contact us" });
    await expect(form).toContainText("don't include your child's name");
    // Empty question: a plain-words error, no request.
    await form.getByRole("button", { name: "Send message" }).click();
    await expect(form.getByRole("alert")).toContainText("write your question");

    const sent = page.waitForRequest((r) => r.url().endsWith("/api/kids/support") && r.method() === "POST");
    await form.getByLabel("Your question").fill("How do Family League codes work between two iPads?");
    await form.getByLabel(/Email for our reply/).fill("parent@example.com");
    await form.getByLabel(/Device and app version/).fill("iPad Air, Moon Club 0.13");
    await form.getByRole("button", { name: "Send message" }).click();
    const body = (await sent).postDataJSON();
    expect(body).toMatchObject({ message: "How do Family League codes work between two iPads?", email: "parent@example.com", device: "iPad Air, Moon Club 0.13", website: "" });
    await expect(page.getByTestId("support-sent")).toContainText("We usually reply within 2 days");
  });

  test("shows the server's error in plain words", async ({ page }) => {
    await page.route("**/api/kids/support", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "That's a lot of messages in one hour. Please try again a little later." }) }));
    await page.goto("./kids/support");
    await page.getByLabel("Your question").fill("Is there a dark mode?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert")).toContainText("try again a little later");
  });

  test("is linked from the club footer, the app page and the privacy policy, and fits a phone", async ({ page }) => {
    await page.goto("./kids");
    await page.locator(".k-foot").getByRole("link", { name: "Help & support" }).click();
    await expect(page).toHaveURL(/\/kids\/support$/);
    await page.goto("./kids/app");
    await page.getByRole("link", { name: "Help & support" }).click();
    await expect(page).toHaveURL(/\/kids\/support$/);
    await page.goto("./kids/privacy");
    await expect(page.getByTestId("privacy-support")).toContainText("180 days");
    await page.getByTestId("privacy-support").getByRole("link", { name: "Help & support" }).click();
    await expect(page).toHaveURL(/\/kids\/support$/);
    await page.setViewportSize({ width: 390, height: 844 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
