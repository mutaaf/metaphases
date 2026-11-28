import { describe, expect, it } from "vitest";
import { rsiLine, trendLine } from "../../shared/trend";

// 0044: The Read says the trend in a real sentence for every trend state shared/grades.ts can return.
const TRENDS = ["Uptrend", "Downtrend", "Sideways", "Recovering", "Pullback in uptrend"];
const BROKEN = /\ban? (recovering|sideways|pullback in)\b/i;

describe("trendLine", () => {
  it.each(TRENDS)("%s reads as a sentence, before a report and with none ahead", (t) => {
    for (const upcoming of [true, false]) {
      const s = trendLine(t, upcoming)!;
      expect(s).toMatch(/^[A-Z][^.]*\.$/);
      expect(s).not.toMatch(BROKEN);
      expect(s).not.toMatch(/\bRSI\b/); // the Everyday lens hides RSI lines; the trend sentence must survive it
    }
  });
  it("names each state in plain words", () => {
    expect(trendLine("Uptrend", true)).toBe("Going into the report, the stock is in an uptrend.");
    expect(trendLine("Downtrend", true)).toBe("Going into the report, the stock is in a downtrend.");
    expect(trendLine("Sideways", true)).toBe("Going into the report, the stock is showing no clear direction yet."); // also grades.ts's default with too little history
    expect(trendLine("Recovering", true)).toBe("Going into the report, the stock is bouncing back but still below its long-term average.");
    expect(trendLine("Pullback in uptrend", true)).toBe("Going into the report, the stock is pulling back within an uptrend.");
  });
  it("no upcoming report: no 'into the report'", () => {
    const s = trendLine("Recovering", false)!;
    expect(s).toBe("Right now the stock is bouncing back but still below its long-term average.");
    expect(s).not.toMatch(/into the (report|print)/i);
  });
  it("an unknown trend value says nothing rather than a broken sentence", () => {
    expect(trendLine("Choppy", true)).toBeNull();
    expect(trendLine("", true)).toBeNull();
  });
});

describe("rsiLine", () => {
  it("rounds, and says nothing without a number", () => {
    expect(rsiLine(27.4)).toBe("Its 14-day RSI is 27.");
    expect(rsiLine(null)).toBeNull();
    expect(rsiLine(undefined)).toBeNull();
    expect(rsiLine(NaN)).toBeNull();
  });
});
