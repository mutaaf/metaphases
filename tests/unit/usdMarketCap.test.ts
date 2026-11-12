// 0042: every market value we rank or print is in US dollars. Finnhub's profile2 cap is in the
// listing's currency (Toyota on Tokyo: ¥36T), which used to head the week brief as "$36.44T".
// Currency rules for the weekly build: tests/unit/universeFx.test.ts.
import { describe, expect, it } from "vitest";
import universe from "../../data/universe.json" with { type: "json" };
import { buildBrief } from "../../src/lib/brief";
import { UNIVERSE, popularity } from "../../src/lib/data";
import { mcap } from "../../src/lib/format";
import { profileCap } from "../../shared/marketCap";
import type { EarningsEvent } from "../../shared/types";

type Entry = { n: string; mc: number; c?: string; mcCur?: string; mcL?: number; fx?: number; fxAt?: string };
const U = universe as unknown as Record<string, Entry>;
const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-11-02", h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: 100, rA: null, t: 1, ...p });

describe("universe market values are US dollars (0042)", () => {
  it("foreign primary listings carry their local cap and currency, converted to USD", () => {
    for (const [s, cur] of [["TM", "JPY"], ["SONY", "JPY"], ["HMC", "JPY"], ["TSM", "TWD"], ["SQM", "CLP"], ["NVO", "DKK"], ["SHEL", "GBP"], ["BP", "GBP"]] as const) {
      expect(U[s]?.mcCur, s).toBe(cur);
    }
  });

  it("a converted cap is local × rate, with the rate's date; USD caps carry no conversion", () => {
    for (const [s, e] of Object.entries(U)) {
      if (e.mcCur) {
        expect(e.mcCur, s).not.toBe("USD");
        expect(e.mcL, s).toBeGreaterThan(0);
        if (e.fx) {
          expect(e.fxAt, s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(e.mc, s).toBe(Math.round(e.mcL! * e.fx));
        } else expect(e.mc, s).toBe(0); // no rate: unknown, never the local number
      } else {
        expect(e.mcL ?? e.fx ?? e.fxAt, s).toBeUndefined();
      }
    }
  });

  it("no cap is bigger than any company could be in dollars", () => {
    const aapl = U.AAPL.mc;
    for (const [s, e] of Object.entries(U)) expect(e.mc, s).toBeLessThan(10_000_000); // $10T
    for (const s of ["TM", "SONY", "HMC", "SQM", "NVO"]) expect(U[s].mc, s).toBeLessThan(aapl);
  });

  it("the mega filter's $200B line doesn't catch a peso or yen number", () => {
    expect(UNIVERSE.SQM.mc).toBeLessThan(200_000);
    expect(UNIVERSE.HMC.mc).toBeLessThan(200_000);
  });

  it("the week brief leads with a US mega cap, not Toyota, and never prints a local cap with $", () => {
    const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    const events = [ev({ s: "TM", d: "2026-11-05", h: "bmo" }), ev({ s: "SONY", d: "2026-11-05" }), ev({ s: "AAPL", d: "2026-11-02" }), ev({ s: "HMC", d: "2026-11-04" }), ev({ s: "CSCO", d: "2026-11-04" })];
    const b = buildBrief(week, events, [], null, UNIVERSE, "2026-11-01");
    expect(b.top[0].s).toBe("AAPL");
    const tm = b.top.find((t) => t.s === "TM")!;
    expect(mcap(tm.mc)).toMatch(/^\$\d{3}B$/); // about $230B, not "$36.44T"
    expect(popularity(ev({ s: "HMC" }))).toBeLessThan(popularity(ev({ s: "CSCO" })));
  });

  it("an unknown value reads as a dash, not $0", () => {
    expect(mcap(0)).toBe("—");
  });

  it("a tracked company's sheet gives the universe's dollar value, whatever the profile says", () => {
    expect(profileCap(UNIVERSE.SQM, { marketCapitalization: 15130410, currency: "USD" })).toEqual({ marketCap: UNIVERSE.SQM.mc, currency: "USD" });
    expect(profileCap({ mc: 0 }, { marketCapitalization: 5, currency: "USD" })).toEqual({ marketCap: null, currency: "USD" });
    expect(profileCap(undefined, { marketCapitalization: 7, currency: "JPY" })).toEqual({ marketCap: 7, currency: "JPY" });
  });
});
