import { describe, expect, it } from "vitest";
import { applyPreReport, nasdaqDayEps, pickConsensus, periodKey, REV_BASIS_MAX, revenueBeatRate, revenueComparable, revenueVerdict, sameEpsBasis, type EstSnapshot } from "../../shared/compare";
import { seasonScore } from "../../shared/depth";
import type { EarningsEvent } from "../../shared/types";
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
  it("prefers Finnhub's pre-report estimate (the calendar's snapshot) over Nasdaq's for the same print", () => {
    const p = pickConsensus({ estimate: "6.52", actual: 7.4, surprisePct: "13.5" }, { estimate: 5.81, actual: 7.4 }, 5.7889);
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

// 0035: Finnhub revises a reported quarter's estimate toward the actual, which turned beats into "misses".
describe("judge a print against the bar set before it (0035)", () => {
  const nq = (estimate: number, actual: number) => ({ estimate, actual, surprisePct: null });
  it.each([
    ["V", 3.5055, 3.48, 3.43],
    ["MA", 5.3156, 5.31, 5.14],
    ["ABBV", 3.823, 3.82, 3.74],
  ])("%s: Finnhub's revised %s vs %s, Nasdaq pre-report %s → beat", (_s, fE, a, nE) => {
    const p = pickConsensus(nq(nE, a), { estimate: fE, actual: a });
    expect(p.source).toBe("nasdaq");
    expect(p.epsE).toBe(nE);
    expect(p.surprisePct!).toBeGreaterThan(0);
  });
  it("uses the pre-report snapshot first, and Finnhub when Nasdaq is on another basis", () => {
    expect(pickConsensus(nq(3.43, 3.48), { estimate: 3.5055, actual: 3.48 }, 3.44)).toMatchObject({ source: "finnhub", epsE: 3.44 });
    // NOW/EQIX-style 2× gap: not the same basis, so Nasdaq's figure isn't swapped in.
    expect(pickConsensus(nq(8.2, 4.1), { estimate: 4.0, actual: 4.1 })).toMatchObject({ source: "finnhub", epsE: 4.0 });
    expect(sameEpsBasis(3.43, 3.5055)).toBe(true);
    expect(sameEpsBasis(8.2, 4)).toBe(false);
    expect(sameEpsBasis(-0.1, 0.1)).toBe(false);
  });

  const ev = (s: string, o: Partial<EarningsEvent>): EarningsEvent => ({ s, d: "2026-10-27", h: "amc", q: 3, y: 2026, eE: null, eA: null, rE: null, rA: null, t: 1, ...o });
  const MSFT = ev("MSFT", { eE: 4.71, eA: 4.89, rE: 92506889896, rA: 92279000000 });
  it("MSFT revenue a hair under a possibly revised estimate, no snapshot → not a miss", () => {
    expect(revenueVerdict(MSFT)).toBe("revised");
    expect(revenueBeatRate([MSFT])).toMatchObject({ judged: 0, excluded: 1, revised: 1, pct: null });
    // Against a snapshot the shortfall is real.
    expect(revenueVerdict({ ...MSFT, pr: "s" })).toBe("miss");
    expect(revenueVerdict(ev("X", { rE: 100, rA: 98 }))).toBe("miss"); // 2% short is a miss
  });

  it("snapshots unreported rows and swaps the snapshot in once the row has an actual", () => {
    const snap: EstSnapshot = {};
    const before = applyPreReport([ev("V", { eE: 3.44, rE: 10.6e9 })], snap);
    expect(before.updates).toEqual({ V: { eE: 3.44, rE: 10.6e9 } });
    Object.assign(snap, before.updates);
    expect(applyPreReport([ev("V", { eE: 3.44, rE: 10.6e9 })], snap).updates).toEqual({}); // unchanged → no write
    const round = JSON.parse(JSON.stringify(snap)) as EstSnapshot; // the cache stores JSON
    const after = applyPreReport([ev("V", { eE: 3.5055, eA: 3.48, rE: 10.75e9, rA: 10.7e9 })], round, { V: 3.43 });
    expect(after.events[0]).toMatchObject({ eE: 3.44, rE: 10.6e9, pr: "s" });
    expect(after.updates).toEqual({});
  });

  it("falls back to Nasdaq's pre-report EPS for reported rows with no snapshot, only in dollars and on the same basis", () => {
    const rows = [ev("V", { eE: 3.5055, eA: 3.48 }), ev("NOW", { eE: 4.0, eA: 4.1 }), ev("KSPI", { eE: 900, eA: 950 }), ev("XX", { eE: 1, eA: 1.1 })];
    const { events } = applyPreReport(rows, {}, { V: 3.43, NOW: 8.2, KSPI: 9.5 }, (s) => s !== "KSPI");
    expect(events.map((e) => [e.s, e.eE, e.pr])).toEqual([["V", 3.43, "n"], ["NOW", 4.0, undefined], ["KSPI", 900, undefined], ["XX", 1, undefined]]);
  });

  it("reads Nasdaq's day calendar figures", () => {
    expect(nasdaqDayEps({ data: { rows: [{ symbol: "V", epsForecast: "$3.43" }, { symbol: "L", epsForecast: "($0.12)" }, { symbol: "Z", epsForecast: "" }] } })).toEqual({ V: 3.43, L: -0.12 });
    expect(nasdaqDayEps(null)).toEqual({});
  });

  it("the season's revenue beat rate doesn't count an estimate that sits just above the actual", () => {
    // Estimate = actual + 0.5%: the drift pattern. Not a miss, not counted.
    const drift = Array.from({ length: 10 }, (_, i) => ev(`D${i}`, { eE: 1, eA: 1.1, rE: 1005, rA: 1000 }));
    const real = [ev("B1", { eE: 1, eA: 1.1, rE: 1000, rA: 1030 }), ev("M1", { eE: 1, eA: 1.1, rE: 1000, rA: 950 })];
    const s = seasonScore([...drift, ...real], () => true, 500, "2026-10-01", "2026-10-31");
    expect(s.revBeatPct).toBe(50);
    expect(s.revExcluded).toBe(10);
  });
});
