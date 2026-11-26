import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";

// 0114: a timeless date inside the cross-check window whose Nasdaq day couldn't be read yet (`next.unchecked`) says
// the time is being checked, never "Date not yet confirmed by the company", and the sheet asks again by itself.
const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

test("an unchecked time reads 'being checked', then the re-read shows Nasdaq's time", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-31T16:00:00Z") });
  let n = 0;
  await page.route("**/api/ticker/NVDA*", async (r) => {
    const body = JSON.parse(fx("ticker-NVDA.json"));
    delete body.next.nasdaq; delete body.next.hs; delete body.next.confirmed;
    body.next = n++ === 0
      ? { ...body.next, date: "2026-11-05", session: "", projected: true, unchecked: true }
      : { ...body.next, date: "2026-11-05", session: "amc", hs: "n", projected: undefined };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("./t/NVDA");
  const card = page.locator(".next-card");
  await expect(card.getByTestId("nc-unchecked")).toContainText("still being checked against Nasdaq's calendar");
  await expect(card.getByTestId("nc-projected")).toHaveCount(0);
  await expect(card).not.toContainText("not yet confirmed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("unchecked-time-sheet.png") });
  await page.clock.runFor(41_000);
  await expect(card.getByTestId("nc-unchecked")).toHaveCount(0);
  await expect(card.getByTestId("nc-session")).toContainText("After close");
});
