import { describe, expect, it } from "vitest";
import { compassGrade, rsi, scoreToGrade, setupGrade, sma } from "../../shared/grades";

describe("scoreToGrade (Market Digest GRADE_SCALE parity)", () => {
  it.each([[95, "A+"], [90, "A+"], [85, "A"], [80, "A-"], [75, "B+"], [70, "B"], [65, "B-"], [60, "C+"], [55, "C"], [50, "C-"], [40, "D"], [39.9, "F"], [0, "F"]])("%d → %s", (s, g) => {
    expect(scoreToGrade(s)).toBe(g);
  });
  it("null-safe", () => expect(scoreToGrade(null)).toBeNull());
});

describe("compassGrade", () => {
  it("rewards a cheap, profitable, growing, healthy company", () => {
    const g = compassGrade({ peTTM: 12, pbQuarterly: 1.2, evEbitdaTTM: 8, grossMarginTTM: 60, operatingMarginTTM: 30, roeTTM: 25, roaTTM: 12, revenueGrowthTTMYoy: 25, epsGrowthTTMYoy: 30, "totalDebt/totalEquityQuarterly": 0.2, currentRatioQuarterly: 2.5, pfcfShareTTM: 15 });
    expect(g.grade).toMatch(/^A/);
    expect(g.factors.map((f) => f.key)).toEqual(["valuation", "profitability", "growth", "health"]);
  });
  it("punishes expensive, shrinking, indebted", () => {
    const g = compassGrade({ peTTM: 80, pbQuarterly: 20, grossMarginTTM: 10, operatingMarginTTM: 1, revenueGrowthTTMYoy: -5, epsGrowthTTMYoy: -20, "totalDebt/totalEquityQuarterly": 4, currentRatioQuarterly: 0.6, pfcfShareTTM: -3 });
    expect(["D", "F"]).toContain(g.grade);
  });
  it("skips missing dimensions instead of scoring them as zero", () => {
    const g = compassGrade({ grossMarginTTM: 60, operatingMarginTTM: 30 });
    expect(g.factors[0].score).toBeNull();
    expect(g.score).toBe(90);
  });
  it("ignores negative P/E (losses) in valuation", () => {
    expect(compassGrade({ peTTM: -10 }).factors[0].score).toBeNull();
  });
  it("every factor explains itself in plain English", () => {
    for (const f of compassGrade({ peTTM: 20 }).factors) expect(f.why.length).toBeGreaterThan(10);
  });
});

describe("technicals", () => {
  const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);
  it("rsi stays in 0..100 and is high in a steady uptrend", () => {
    const r = rsi(up)!;
    expect(r).toBeGreaterThan(50);
    expect(r).toBeLessThanOrEqual(100);
  });
  it("rsi needs more than `period` closes", () => expect(rsi([1, 2, 3])).toBeNull());
  it("sma", () => expect(sma([1, 2, 3, 4], 2)).toBe(3.5));
  it("setupGrade labels an uptrend and folds in the beat rate", () => {
    const s = setupGrade({ close: up, high: up.map((x) => x + 1), low: up.map((x) => x - 1), beatRate: 1 });
    expect(s.trend).toBe("Uptrend");
    expect(s.grade).not.toBeNull();
    const worse = setupGrade({ close: up, high: up.map((x) => x + 1), low: up.map((x) => x - 1), beatRate: 0 });
    expect(worse.score!).toBeLessThan(s.score!);
  });
  it("calls a falling stock a downtrend", () => {
    const down = up.slice().reverse();
    expect(setupGrade({ close: down, high: down, low: down, beatRate: null }).trend).toBe("Downtrend");
  });
});
