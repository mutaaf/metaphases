import { describe, expect, it } from "vitest";
import { trendLine } from "../../shared/trend";

// 0044: The Read says the trend in a real sentence for every trend state shared/grades.ts can return.
const TRENDS = ["Uptrend", "Downtrend", "Sideways", "Recovering", "Pullback in uptrend"];
const BROKEN = /\ban? (recovering|sideways|pullback in)\b|in an? (uptrend|downtrend) in\b/i;

describe("trendLine", () => {
  it.each(TRENDS)("%s reads as a sentence, before a report and with none ahead", (t) => {
    for (const upcoming of [true, false]) {
      const s = trendLine(t, 27.4, upcoming)!;
      expect(s).toMatch(/^[A-Z].*\.$/);
      expect(s).not.toMatch(BROKEN);
      expect(s).toContain("RSI 27");
    }
  });
  it("names each state in plain words", () => {
    expect(trendLine("Uptrend", null, true)).toBe("Going into the report, the stock is in an uptrend.");
    expect(trendLine("Downtrend", 38, true)).toBe("Going into the report, the stock is in a downtrend, with RSI 38.");
    expect(trendLine("Sideways", null, true)).toBe("Going into the report, the stock is moving sideways.");
    expect(trendLine("Recovering", 27, true)).toBe("Going into the report, the stock is bouncing back but still below its long-term average, with RSI 27.");
    expect(trendLine("Pullback in uptrend", 35, true)).toBe("Going into the report, the stock is pulling back within an uptrend, with RSI 35.");
  });
  it("no upcoming report: no 'into the report'", () => {
    const s = trendLine("Recovering", 27, false)!;
    expect(s).toBe("Right now the stock is bouncing back but still below its long-term average, with RSI 27.");
    expect(s).not.toMatch(/into the (report|print)/i);
  });
  it("an unknown trend value says nothing rather than a broken sentence", () => {
    expect(trendLine("Choppy", 50, true)).toBeNull();
    expect(trendLine("", 50, true)).toBeNull();
  });
});
