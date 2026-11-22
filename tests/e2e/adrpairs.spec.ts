// 0100: an ADR's newest report on the sheet is the calendar's own-currency pair (PDD CN¥19.21 → CN¥21.04, +9.5%),
// and Nasdaq's older dollar pairs that don't match the company's figures read "basis differs".
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const nio = () => JSON.parse(readFileSync(new URL("../fixtures/ticker-NIO.json", import.meta.url), "utf8"));

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`PDD-shaped sheet at ${size.width}: latest report in CN¥ like the calendar, older dollar rows out of the record`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route("**/api/ticker/NIO", async (r) => {
      const body = nio();
      const [first, ...rest] = body.history;
      body.history = [
        { ...first, epsE: 19.213, epsA: 21.04, surprisePct: 9.49, cur: "CNY" },
        ...rest.map((h: any) => ({ ...h, surprisePct: null, basis: "differs" })),
      ];
      body.beatRate = { beats: 1, total: 1 };
      await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("./?t=NIO");
    const sheet = page.locator(".sheet");
    const top = sheet.locator(".rx-table tbody tr").first();
    await expect(top).toContainText("CN¥19.21");
    await expect(top).toContainText("CN¥21.04");
    await expect(top).toContainText("+9.5%");
    await expect(top).not.toContainText("$21.04");
    await expect(sheet.locator(".rx-table tbody tr").nth(1)).toContainText("basis differs");
    await expect(sheet.locator("[data-testid=rx-epsbasis]")).toContainText("converted at that quarter's exchange rate");
    await expect(sheet.locator("[data-testid=nc-currency]")).toContainText("the latest report is in Chinese yuan");
    await expect(sheet.getByText("1/1 beats")).toBeVisible();
    expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth)))).toBeLessThanOrEqual(1);
    await sheet.locator(".rx-table").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/0100-adr-${size.width}.png` });
  });
}

test("cold cache shape (no row in yuan): the sheet still says the table is in US dollars", async ({ page }) => {
  await page.goto("./?t=NIO");
  await expect(page.locator(".sheet [data-testid=nc-currency]")).toContainText("The reaction table below is in US dollars.");
});
