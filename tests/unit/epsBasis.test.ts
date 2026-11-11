import { describe, expect, it } from "vitest";
import { applyPreReport, epsVerdict, isReit, judgeReaction } from "../../shared/compare";
import { seasonScore } from "../../shared/depth";
import { reportedLine, tickerShareDesc } from "../../shared/reported";
import { resultOf, surprise } from "../../src/lib/data";
import { retraceContext } from "../../src/lib/aiContext";
import type { EarningsEvent, TickerResponse } from "../../shared/types";

// 0049: an EPS actual on another basis from its estimate (REIT FFO vs GAAP EPS, per-ADR vs per-share,
// adjusted vs GAAP) is not a +377% beat.
const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-11-02", h: "amc", q: 3, y: 2026, eE: 1, eA: 1.05, rE: null, rA: null, t: 1, ...p });

describe("epsVerdict (0049)", () => {
  it("UDR: FFO actual vs a GAAP estimate is judged against Nasdaq's figure on the actual's basis (+1.6%)", () => {
    const v = epsVerdict({ eE: 0.14, eA: 0.65, nE: 0.64 });
    expect(v.v).toBe("beat");
    expect(v.via).toBe("nasdaq");
    expect(v.est).toBe(0.64);
    expect(v.pct).toBeCloseTo(1.5625, 3);
  });
  it("CPT: Core FFO $1.71 against a $0.5319 GAAP estimate, no Nasdaq figure: not comparable", () => {
    expect(epsVerdict({ eE: 0.5319, eA: 1.71 })).toMatchObject({ v: "not-comparable", pct: null });
  });
  it("TM: per-ADR actual vs per-share estimate (10×): not comparable", () => {
    expect(epsVerdict({ eE: 64.4986, eA: 649.358 })).toMatchObject({ v: "not-comparable", pct: null });
  });
  it("UBER: $0.25 GAAP against a $0.94 adjusted consensus, Nasdaq on the same mix: not comparable, never −73%", () => {
    expect(epsVerdict({ eE: 0.9838, eA: 0.25, nE: 0.94 })).toMatchObject({ v: "not-comparable", pct: null });
  });
  it("ordinary beats and misses are untouched", () => {
    expect(epsVerdict({ eE: 3.43, eA: 3.48 })).toMatchObject({ v: "beat" });
    expect(epsVerdict({ eE: 3.43, eA: 3.48 }).pct).toBeCloseTo(1.4577, 3);
    expect(epsVerdict({ eE: 1, eA: 0.8 })).toMatchObject({ v: "miss", pct: expect.closeTo(-20, 6) });
    expect(epsVerdict({ eE: -0.5, eA: -0.4 })).toMatchObject({ v: "beat", pct: expect.closeTo(20, 6) });
  });
  it("a sign flip from a real estimate is not comparable (RIOT −0.34 → 0.01, LYFT 0.22 → −0.03)", () => {
    expect(epsVerdict({ eE: -0.34, eA: 0.01 }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 0.22, eA: -0.03 }).v).toBe("not-comparable");
  });
  it("both figures within 10¢ of zero: a beat or miss, but no percentage (a % of a near-zero base means nothing)", () => {
    expect(epsVerdict({ eE: -0.02, eA: 0.01 })).toMatchObject({ v: "beat", pct: null });
    expect(epsVerdict({ eE: 0.0306, eA: 0.01 })).toMatchObject({ v: "miss", pct: null });
  });
  it("nothing to judge without both figures", () => {
    expect(epsVerdict({ eE: null, eA: 1 }).v).toBeNull();
    expect(epsVerdict({ eE: 1, eA: null }).v).toBeNull();
  });
});

describe("every EPS judgment goes through it (0049)", () => {
  const UDR = ev({ s: "UDR", eE: 0.14, eA: 0.65, nE: 0.64 });
  const CPT = ev({ s: "CPT", eE: 0.5319, eA: 1.71 });
  const TM = ev({ s: "TM", eE: 64.4986, eA: 649.358 });
  const UBER = ev({ s: "UBER", eE: 0.9838, eA: 0.25, nE: 0.94 });
  const V = ev({ s: "V", eE: 3.43, eA: 3.48 });

  it("calendar rows: no result, no surprise for a basis mix; Nasdaq-judged UDR is a +1.6% beat", () => {
    expect(resultOf(CPT)).toBeNull();
    expect(surprise(CPT)).toBeNull();
    expect(resultOf(TM)).toBeNull();
    expect(resultOf(UBER)).toBeNull();
    expect(resultOf(UDR)).toBe("beat");
    expect(surprise(UDR)).toBeCloseTo(1.5625, 3);
  });
  it("Retrace context: basis mixes stay out of the beat rate, the median and the biggest lists", () => {
    const c = retraceContext([UDR, CPT, TM, UBER, V], "November");
    expect(c.epsBeatPct).toBe(100); // UDR and V, the only two judged
    expect(c.epsExcluded).toBe(3);
    expect([...c.topBeats, ...c.topMisses].map((e) => e.s)).not.toContain("CPT");
    expect(c.medianSurprise! < 2).toBe(true);
  });
  it("the season scoreboard leaves basis mixes out too", () => {
    const s = seasonScore([CPT, TM, UBER, V], () => true, 500, "2026-10-01", "2026-11-30");
    expect(s.epsBeatPct).toBe(100);
    expect(s.medianSurprise).toBeCloseTo(1.5, 1);
  });
  it("the sheet history: a basis mix shows no surprise and says why; Nasdaq's figure stands in when it matches", () => {
    expect(judgeReaction({ epsE: 0.5319, epsA: 1.71, surprisePct: 221.5 })).toEqual({ epsE: 0.5319, epsA: 1.71, surprisePct: null, basis: "differs" });
    expect(judgeReaction({ epsE: 0.14, epsA: 0.65, surprisePct: 364 }, 0.64)).toMatchObject({ epsE: 0.64, surprisePct: expect.closeTo(1.5625, 3) });
    expect(judgeReaction({ epsE: 3.43, epsA: 3.48, surprisePct: 1.46 })).toEqual({ epsE: 3.43, epsA: 3.48, surprisePct: 1.46 });
  });
  it("The Read and the share text never call a basis mix a beat or a miss", () => {
    const line = reportedLine("Camden", { date: "2026-11-05", session: "amc", quarter: 3, epsE: 0.5319, epsA: 1.71 }, "2026-11-06", (v) => `$${v.toFixed(2)}`);
    expect(line).not.toMatch(/a beat of|a miss of|in line/i);
    expect(line).toMatch(/same basis/);
    const base = { beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as unknown as TickerResponse;
    const desc = tickerShareDesc("Camden", { ...base, next: null, justReported: { date: "2026-11-05", session: "amc", quarter: 3, year: 2026, epsE: 0.5319, epsA: 1.71, currency: "USD" } });
    expect(desc).not.toMatch(/expected/);
  });
});

describe("REIT estimates (0049)", () => {
  it("knows which names are REITs (Real Estate sector, minus brokers and listing sites)", () => {
    expect(isReit("UDR", "Real Estate")).toBe(true);
    expect(isReit("CBRE", "Real Estate")).toBe(false);
    expect(isReit("AAPL", "Information Technology")).toBe(false);
  });
  it("/t/UDR og:description doesn't say \"Street expects $0.14 EPS\"", () => {
    const base = { beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as unknown as TickerResponse;
    const desc = tickerShareDesc("UDR", { ...base, next: { date: "2027-02-10", session: "amc", quarter: 4, year: 2026, epsE: 0.14, revE: null, currency: "USD", epsBasis: "ffo" } });
    expect(desc).not.toMatch(/Street expects/);
  });
});

describe("the calendar carries Nasdaq's figure for a basis mix (0049)", () => {
  it("attaches nE when Nasdaq's pre-report EPS differs in basis from Finnhub's and matches the actual", () => {
    const { events } = applyPreReport([ev({ s: "UDR", eE: 0.14, eA: 0.65 })], {}, { UDR: 0.64 });
    expect(events[0].nE).toBe(0.64);
    expect(resultOf(events[0])).toBe("beat");
  });
  it("leaves ordinary rows alone (no nE)", () => {
    const { events } = applyPreReport([ev({ s: "V", eE: 3.5055, eA: 3.48 })], {}, { V: 3.43 });
    expect(events[0].nE).toBeUndefined();
    expect(events[0]).toMatchObject({ eE: 3.43, pr: "n" });
  });
});
