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

describe("self-review follow-ups (0049)", () => {
  it("PSA: a REIT's Core FFO $4.34 against a $2.42 GAAP estimate is inside 0.5–2× but not a +80% beat", () => {
    expect(epsVerdict({ eE: 2.4173, eA: 4.34, reit: true })).toMatchObject({ v: "not-comparable", pct: null });
    expect(epsVerdict({ eE: 2.4173, eA: 4.34, nE: 4.26, reit: true })).toMatchObject({ v: "beat", via: "nasdaq" });
    // A REIT whose feed figures agree (PLD) is judged as usual.
    expect(epsVerdict({ eE: 0.8181, eA: 0.86, reit: true }).v).toBe("beat");
    expect(resultOf(ev({ s: "PSA", eE: 2.4173, eA: 4.34 }))).toBeNull();
  });
  it("Nasdaq's figure on the actual's basis wins inside the band too, and is attached by applyPreReport", () => {
    const { events } = applyPreReport([ev({ s: "PSA", eE: 2.4173, eA: 4.34 })], {}, { PSA: 4.26 });
    expect(events[0].nE).toBe(4.26);
    expect(surprise(events[0])).toBeCloseTo(1.88, 1);
  });
  it("a snapshot row on another basis still gets Nasdaq's figure", () => {
    const { events } = applyPreReport([ev({ s: "UDR", eE: 0.15, eA: 0.65 })], { UDR: { eE: 0.14, rE: null } }, { UDR: 0.64 });
    expect(events[0]).toMatchObject({ pr: "s", eE: 0.14, nE: 0.64 });
  });
  it("a near-zero estimate gets a direction but no percentage, even in band (2¢ → 4¢ is not +100%)", () => {
    expect(epsVerdict({ eE: 0.02, eA: 0.04 })).toMatchObject({ v: "beat", pct: null });
  });
  it("Retrace's sector table counts only judged reports", () => {
    const c = retraceContext([ev({ s: "CPT", eE: 0.5319, eA: 1.71 }), ev({ s: "UDR", eE: 0.14, eA: 0.65 })], "November");
    expect(c.sectors.find((x) => x.sector === "Real Estate")).toBeUndefined();
  });
  it("The Read judges UDR against Nasdaq's figure when the calendar row carries it", () => {
    const line = reportedLine("UDR", { date: "2026-11-02", session: "amc", quarter: 3, epsE: 0.14, epsA: 0.65, nE: 0.64, reit: true }, "2026-11-03", (v) => `$${v.toFixed(2)}`);
    expect(line).toContain("against $0.64 expected");
    expect(line).toMatch(/a beat of 2%/);
  });
  it("the AI ticker facts never hand the model a basis-mix estimate or surprise", async () => {
    const { factsFor } = await import("../../worker/ai/prompts");
    const f = factsFor("ticker", {
      symbol: "UDR", profile: { name: "UDR" },
      next: { date: "2027-02-10", session: "amc", quarter: 4, year: 2026, epsE: 0.14, revE: null, currency: "USD", epsBasis: "ffo" },
      justReported: { date: "2026-11-05", session: "amc", quarter: 3, year: 2026, epsE: 0.5319, epsA: 1.71, currency: "USD" },
      history: [{ date: "2026-08-01", period: "Jun 2026", session: "amc", epsE: 0.5319, epsA: 1.71, surprisePct: null, move: 1, basis: "differs" }],
    }).join("\n");
    expect(f).not.toContain("$0.14");
    expect(f).not.toContain("against an estimate of $0.53");
    expect(f).toMatch(/different basis/);
  });
});
