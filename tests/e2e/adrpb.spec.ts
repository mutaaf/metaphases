// 0101: an ADR whose newest feed quarter is in another currency shows P/B "—" (not BABA's 9.7×) and says so.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { currencyBreak, sanitizeMetric } from "../../shared/currencyBreak";
import { compassGrade } from "../../shared/grades";

const nio = () => JSON.parse(readFileSync(new URL("../fixtures/ticker-NIO.json", import.meta.url), "utf8"));
// BABA's live metric map on 2026-11-22 and a series whose newest quarter is in dollars (×0.14).
const METRIC = { peTTM: 22.0, pbQuarterly: 9.7, evEbitdaTTM: 38.2, grossMarginTTM: 37.9, operatingMarginTTM: 3.5, roeTTM: 7.4, roaTTM: 4.1, "totalDebt/totalEquityQuarterly": 0.22, currentRatioQuarterly: 1.5, pfcfShareTTM: 12 };
const SERIES = { salesPerShare: [["2025-12-31", 119.5], ["2026-03-31", 102.2], ["2026-06-30", 108.5], ["2026-09-30", 15.6]].map(([period, v]) => ({ period: period as string, v: v as number })) };
const WARN = "One quarter the data feed reported in another currency is left out of the quarterly figures, and growth and price-to-book aren't graded.";

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`ADR sheet at ${size.width}: P/B reads — and Valuation is graded on P/E and EV/EBITDA`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route("**/api/ticker/NIO", async (r) => {
      const body = nio();
      body.compass = compassGrade(sanitizeMetric(METRIC, currencyBreak(SERIES, "CNY")) as any);
      body.warnings = [WARN];
      await r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("./?t=NIO");
    const sheet = page.locator(".sheet");
    await expect(sheet.getByText(`Partial picture: ${WARN}`)).toBeVisible();
    const row = sheet.locator(".factors li").filter({ hasText: "Valuation" });
    await row.locator(".factor-row").click();
    const pb = row.locator(".f-inputs div").filter({ hasText: "P/B" });
    await expect(pb.locator("dd")).toHaveText("—");
    await expect(row.locator(".f-inputs")).not.toContainText("9.7×");
    await expect(row.locator(".f-inputs")).toContainText("22.0×");
    await expect(row.locator(".factor-row")).toHaveText(/Valuation\s*D$/);
    expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll("[role=dialog]")].map((d) => d.scrollWidth - d.clientWidth)))).toBeLessThanOrEqual(1);
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/0101-adr-pb-${size.width}.png` });
  });
}
