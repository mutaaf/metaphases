import type { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";

const sse = (chunks: string[]) => chunks.map((t) => `data: ${JSON.stringify({ t })}\n\n`).join("") + `data: ${JSON.stringify({ done: true, provider: "edge", model: "m" })}\n\n`;
const PREVIEW = ["**NVIDIA** reports on Tuesday after the close.\n", "- Wall Street expects **$2.53** a share\n", "- It beat in 4 of its last 4 reports\n"];
const BRIEF = ["The biggest reports ahead are **Apple** on Monday after the close.\n", "- Watch the **jobs report** on Friday\n"];

async function mockAi(page: Page, opts: { streams?: string[][]; onStream?: (r: Route) => void } = {}) {
  const queue = [...(opts.streams ?? [BRIEF])];
  const calls: { headers: Record<string, string>; body: any }[] = [];
  await page.route("**/api/ai/stream", async (r) => {
    calls.push({ headers: r.request().headers(), body: r.request().postDataJSON() });
    opts.onStream?.(r);
    await r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(queue.length > 1 ? queue.shift()! : queue[0]) });
  });
  await page.route("**/api/ai/models", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "anthropic", models: ["claude-haiku-5-5", "claude-sonnet-5-5"], suggested: "claude-haiku-5-5" }) }));
  return calls;
}

test("BYOK settings: pick a provider, paste a key, test, saved in this browser", async ({ page }) => {
  await mockAi(page);
  let modelsKey = "";
  await page.route("**/api/ai/models", (r) => { modelsKey = r.request().headers()["x-mp-key"]; r.fulfill({ contentType: "application/json", body: JSON.stringify({ models: ["claude-haiku-5-5", "claude-sonnet-5-5"], suggested: "claude-haiku-5-5" }) }); });
  await page.goto("./");
  await page.getByRole("button", { name: "AI settings" }).click();
  const sheet = page.getByRole("dialog", { name: "AI settings" });
  await expect(sheet.getByRole("heading", { name: "Choose your brain" })).toBeVisible();
  await expect(sheet.getByText("Only in this browser")).toBeVisible();
  await sheet.getByRole("radio", { name: /Anthropic/ }).click();
  await sheet.getByLabel("Your Anthropic API key").fill("sk-ant-test-123");
  await sheet.getByRole("button", { name: "Test & save" }).click();
  await expect(sheet.getByRole("status")).toContainText("Connected — 2 models");
  expect(modelsKey).toBe("sk-ant-test-123");
  await expect(sheet.locator("select")).toHaveValue("claude-haiku-5-5");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("metaphases:ai:v1") || "{}"));
  expect(saved).toMatchObject({ provider: "anthropic", key: "sk-ant-test-123", model: "claude-haiku-5-5", verified: true });
  await sheet.getByRole("button", { name: "Forget my key" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("metaphases:ai:v1") || "{}").key)).toBe("");
});

test("Ask about this week streams a grounded answer, and follow-ups carry the key", async ({ page }) => {
  const calls = await mockAi(page, { streams: [BRIEF, ["Mega caps after the close: **AAPL**."]] });
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("metaphases:ai:v1", JSON.stringify({ provider: "openai", key: "sk-test", model: "gpt-5-mini", models: ["gpt-5-mini"], verified: true })));
  await page.reload();
  await page.getByRole("button", { name: "Ask about this week" }).click();
  const dialog = page.getByRole("dialog", { name: "The weeks ahead" });
  await expect(dialog.locator(".msg-assistant")).toContainText("Watch the jobs report on Friday");
  await expect(page).toHaveTitle(/Ask Metaphases/);
  expect(calls[0].body.task).toBe("week");
  expect(calls[0].body.context.events.length).toBeGreaterThan(3);
  expect(calls[0].headers["x-mp-key"]).toBe("sk-test");
  await dialog.getByRole("button", { name: "Which mega caps report after the close next week?" }).click();
  await expect(dialog.locator(".msg-assistant").nth(1)).toContainText("Mega caps after the close");
  expect(calls[1].body.task).toBe("ask");
  expect(calls[1].body.history.length).toBe(2);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("free brain by default: no key header is ever sent", async ({ page }) => {
  const calls = await mockAi(page);
  await page.goto("./");
  await page.getByRole("button", { name: /Ask AI/ }).first().click();
  await expect(page.locator(".msg-assistant").first()).toContainText("Apple");
  expect(calls[0].headers["x-mp-key"]).toBeUndefined();
  expect(calls[0].body.provider).toBe("edge");
  await expect(page.getByText(/Free brain · Workers AI/)).toBeVisible();
});

test("ticker sheet: the AI preview writes on demand and is remembered", async ({ page }) => {
  const calls = await mockAi(page, { streams: [PREVIEW] });
  await page.goto("./?t=NVDA");
  const card = page.locator(".ai-preview");
  await expect(card.getByText("What to watch in this report")).toBeVisible();
  expect(calls.length).toBe(0); // never auto-spends
  await card.getByRole("button", { name: "Write the preview" }).click();
  await expect(card).toContainText("Wall Street expects $2.53 a share");
  expect(calls[0].body.task).toBe("ticker");
  expect(calls[0].body.context.symbol).toBe("NVDA");
  expect(calls[0].body.context.spark).toBeUndefined();
  await page.reload();
  await expect(page.locator(".ai-preview")).toContainText("Wall Street expects $2.53 a share");
  expect(calls.length).toBe(1);
});

test("Compass explains exposure; Retrace explains the month", async ({ page }) => {
  const calls = await mockAi(page, { streams: [["Your biggest exposure is **AAPL**."], ["October was a solid month."]] });
  await page.goto("./compass");
  await page.getByRole("button", { name: /sample portfolio/i }).click();
  await page.getByRole("button", { name: "Explain my exposure" }).click();
  await expect(page.locator(".msg-assistant").first()).toContainText("biggest exposure");
  expect(calls[0].body.task).toBe("exposure");
  expect(calls[0].body.context.rows.length).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.goto("./retrace");
  await page.getByRole("button", { name: "What happened this month" }).click();
  await expect(page.locator(".msg-assistant").first()).toContainText("solid month");
  expect(calls[1].body.task).toBe("retrace");
  expect(calls[1].body.context.reported).toBeGreaterThan(10);
});

test("errors are friendly and point to settings", async ({ page }) => {
  await page.route("**/api/ai/stream", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "You've used the free brain 30 times this hour. Add your own key in AI settings for unlimited questions." }) }));
  await page.goto("./");
  await page.getByRole("button", { name: "Ask about this week" }).click();
  await expect(page.locator(".msg-error")).toContainText("own key");
  await page.getByRole("button", { name: "Open AI settings" }).click();
  await expect(page.getByRole("dialog", { name: "AI settings" })).toBeVisible();
});
