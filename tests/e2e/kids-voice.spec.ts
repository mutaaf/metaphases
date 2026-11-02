// Kids read-aloud voices: free device voice by default; a grown-up's own OpenAI/Gemini key (behind the gate)
// for a friendlier voice. Chat stays on the free brain, and nothing a kid types is ever sent for speech.
import type { Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures";

const FAKE = "sk-test-voice";
const MP3 = Buffer.from([0xff, 0xf3, 0x44, 0xc4, 0, 0, 0, 0]);

async function passGate(page: Page) {
  const gate = page.getByRole("dialog", { name: "For grown-ups" });
  const q = await gate.locator(".k-gate-q").textContent();
  const [a, b] = (q ?? "").match(/\d+/g)!.map(Number);
  await gate.getByRole("textbox").fill(String(a * b));
  await gate.getByRole("button", { name: "Continue" }).click();
}
function trackSpeak(page: Page) {
  const calls: { key?: string; body: any }[] = [];
  page.route("**/api/ai/speak", async (r) => {
    calls.push({ key: r.request().headers()["x-mp-key"], body: r.request().postDataJSON() });
    await r.fulfill({ status: 200, contentType: "audio/mpeg", body: MP3 });
  });
  return calls;
}

test.describe("Kids voices", () => {
  test.use({ lens: "kids" });

  test("device voice by default: Read it to me makes no voice-service request", async ({ page }) => {
    const calls = trackSpeak(page);
    await page.goto("./kids");
    await page.locator(".k-story").getByRole("button", { name: /read this out loud/i }).click();
    await page.waitForTimeout(300);
    expect(calls).toEqual([]);
  });

  test("a grown-up sets up OpenAI behind the gate; read-aloud then uses their key, chat stays free", async ({ page }) => {
    const calls = trackSpeak(page);
    const streams: { key?: string; body: any }[] = [];
    await page.route("**/api/ai/stream", async (r) => {
      streams.push({ key: r.request().headers()["x-mp-key"], body: r.request().postDataJSON() });
      await r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ t: "Cats like boxes because boxes feel safe." })}\n\ndata: ${JSON.stringify({ done: true, provider: "edge", model: "m" })}\n\n` });
    });
    await page.goto("./kids");
    await page.getByRole("button", { name: "For grown-ups" }).click();
    await passGate(page);
    const sec = page.locator(".k-voice");
    await sec.getByRole("radio", { name: /OpenAI/ }).click();
    const key = sec.getByLabel(/Your OpenAI key/);
    await expect(key).toHaveAttribute("type", "password");
    await key.fill(FAKE);
    await sec.getByRole("button", { name: "Save" }).click();
    await expect(sec).toContainText("Key saved on this device");
    await expect(sec).not.toContainText(FAKE); // only a masked form is shown back
    await sec.getByRole("radio", { name: /fable/i }).click();
    await sec.getByRole("button", { name: /Hear a sample/ }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ key: FAKE, body: { provider: "openai", voice: "fable" } });

    await page.getByRole("button", { name: "Back to kids" }).click();
    await page.locator(".k-story").getByRole("button", { name: /read this out loud/i }).click();
    await expect.poll(() => calls.length).toBe(2);
    expect(calls[1].key).toBe(FAKE);
    expect(calls[1].body.text).toMatch(/Market weather/);

    // Ask Luna: the chat never carries the key, and the kid's typed question is never spoken by the service.
    await page.locator(".k-tabbar a", { hasText: "Ask Luna" }).click();
    await page.getByLabel(/type your own money question/i).fill("why do cats like boxes");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".k-luna-says")).toContainText("boxes feel safe");
    expect(streams[0].key).toBeUndefined();
    expect(streams[0].body.task).toBe("kids");
    await page.getByRole("button", { name: /Read Luna's answer/ }).click();
    await expect.poll(() => calls.length).toBe(3);
    expect(calls[2].body.text).toBe("Cats like boxes because boxes feel safe.");
    expect(calls.every((c) => !/why do cats like boxes/i.test(c.body.text))).toBe(true);
  });

  test("an answer that repeats what the kid typed falls back to the device voice", async ({ page }) => {
    await page.addInitScript((k) => { try { localStorage.setItem("metaphases:kids:voice:v1", JSON.stringify({ mode: "gemini", key: k, voice: "Leda" })); } catch {} }, FAKE);
    const calls = trackSpeak(page);
    await page.route("**/api/ai/stream", (r) => r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ t: "You asked: my name is Sam and I live on Elm Street. Let's talk about money instead!" })}\n\ndata: ${JSON.stringify({ done: true, provider: "edge", model: "m" })}\n\n` }));
    await page.goto("./kids/ask");
    await page.getByLabel(/type your own money question/i).fill("my name is Sam and I live on Elm Street");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".k-luna-says")).toContainText("money instead");
    await page.getByRole("button", { name: /Read Luna's answer/ }).click();
    await page.waitForTimeout(400);
    expect(calls).toEqual([]);
  });

  test("Forget key returns to the free device voice", async ({ page }) => {
    await page.addInitScript((k) => { try { localStorage.setItem("metaphases:kids:voice:v1", JSON.stringify({ mode: "openai", key: k, voice: "nova" })); } catch {} }, FAKE);
    await page.goto("./kids");
    await page.getByRole("button", { name: "For grown-ups" }).click();
    await passGate(page);
    await page.locator(".k-voice").getByRole("button", { name: "Forget key" }).click();
    await expect(page.locator(".k-voice").getByRole("radio", { name: /Device voice/ })).toHaveAttribute("aria-checked", "true");
    const saved = await page.evaluate(() => localStorage.getItem("metaphases:kids:voice:v1") ?? "");
    expect(saved).not.toContain("sk-test");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
