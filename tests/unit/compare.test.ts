import { describe, expect, it } from "vitest";
import { pickConsensus, periodKey, REV_BASIS_MAX, revenueBeatRate, revenueComparable, revenueVerdict } from "../../shared/compare";
import { seasonScore } from "../../shared/depth";
import { epsIn, moneyIn } from "../../shared/currency";
import { resultOf } from "../../src/lib/data";
import { retraceContext } from "../../src/lib/aiContext";
import { factsFor } from "../../worker/ai/prompts";
import type { EarningsEvent } from "../../shared/types";

const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-10-28", h: "amc", q: 3, y: 2026, eE: 1, eA: 1.1, rE: 100, rA: 101, t: 1, ...p });
// Alphabet Q3 2026 as Finnhub reports it: actual net of traffic-acquisition costs, estimate gross.
const GOOGL = ev({ s: "GOOGL", eE: 2.26, eA: 2.87, rE: 132020419167, rA: 111211000000 });
// A KSPI-like row: Kazakh tenge figures, not dollars.
const KSPI = ev({ s: "KSPI", eE: 1571.76, eA: 1602.1, rE: 1.27e12, rA: 1.31e12, t: 0 });

describe("revenue basis (0011)", () => {
  it("GOOGL's net-vs-gross row isn't comparable and isn't a miss", () => {
    expect(revenueVerdict(GOOGL, "USD")).toBe("not-comparable");
    expect(revenueComparable(GOOGL, "USD")).toBe(false);
    // EPS beat alone decides it; before the fix this was "mixed" (−15.8% revenue "miss").
    expect(resultOf(GOOGL)).toBe("beat");
  });
  it("GOOGL is excluded from revenue beat rates, and the exclusion is counted", () => {
    const r = revenueBeatRate([GOOGL, ev({ s: "A", rE: 100, rA: 103 }), ev({ s: "B", rE: 100, rA: 97 })]);
    expect(r).toMatchObject({ beats: 1, judged: 2, excluded: 1, pct: 50 });
    const season = seasonScore([GOOGL, ev({ s: "A", rE: 100, rA: 103 })], () => true, 500, "2026-10-01", "2026-10-31");
    expect(season.revBeatPct).toBe(100);
    expect(season.revExcluded).toBe(1);
  });
  it("the AI's retrace facts don't hand it GOOGL's revenue as a miss", () => {
    const ctx = retraceContext([GOOGL, ev({ s: "A", rE: 100, rA: 103 })], "October 2026");
    expect(ctx.revBeatPct).toBe(100);
    expect(ctx.revExcluded).toBe(1);
    const facts = factsFor("retrace", ctx).join("\n");
    expect(facts).toContain("1 reports left out");
    expect(facts).not.toMatch(/GOOGL[^\n]*rev actual/);
    expect(facts).toMatch(/GOOGL[^\n]*different basis/);
  });
  it("ordinary surprises inside the threshold are still judged", () => {
    expect(revenueVerdict(ev({ rE: 100, rA: 100 + REV_BASIS_MAX * 100 - 0.5 }), "USD")).toBe("beat");
    expect(revenueVerdict(ev({ rE: 100, rA: 95 }), "USD")).toBe("miss");
    expect(resultOf(ev({ s: "AAPL", eA: 0.9, rA: 95 }))).toBe("miss");
    expect(resultOf(ev({ s: "AAPL", eA: 1.1, rA: 95 }))).toBe("mixed");
    expect(revenueVerdict(ev({ rA: null }), "USD")).toBeNull();
  });
  it("a non-USD filer's revenue is never judged, and is never formatted with $", () => {
    expect(revenueVerdict(KSPI, "KZT")).toBe("not-comparable");
    expect(revenueVerdict(KSPI, "")).toBe("not-comparable");
    for (const c of ["KZT", ""]) {
      expect(moneyIn(KSPI.rE, c)).not.toContain("$");
      expect(epsIn(KSPI.eE, c)).not.toContain("$");
    }
  });
});

describe("one consensus per quarter (0011, META Q3 2026)", () => {
  it("prefers Finnhub's estimate (the calendar's) over Nasdaq's for the same print", () => {
    const p = pickConsensus({ estimate: "6.52", actual: 7.4, surprisePct: "13.5" }, { estimate: 5.7889, actual: 7.4 });
    expect(p.source).toBe("finnhub");
    expect(p.epsE).toBeCloseTo(5.7889);
    expect(p.surprisePct).toBeCloseTo(27.8, 1);
  });
  it("falls back to Nasdaq when Finnhub has nothing for the quarter", () => {
    const p = pickConsensus({ estimate: "6.52", actual: "7.40", surprisePct: "13.5" }, undefined);
    expect(p).toMatchObject({ source: "nasdaq", epsE: 6.52, epsA: 7.4 });
    expect(p.surprisePct).toBeCloseTo(13.5, 1);
    expect(pickConsensus({ estimate: "N/A", actual: "N/A", surprisePct: "N/A" }).source).toBeNull();
  });
  it("matches quarters across Nasdaq and Finnhub period formats", () => {
    expect(periodKey("Sep 2026")).toBe("2026-09");
    expect(periodKey("2026-09-30")).toBe("2026-09");
    expect(periodKey("garbage")).toBeNull();
  });
});
