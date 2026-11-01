import { describe, expect, it } from "vitest";
import { monthWeeks, weekOf, addDays, daysBetween } from "../../src/lib/dates";
import { resultOf, surprise, heldVia, UNIVERSE, ETFS } from "../../src/lib/data";
import type { EarningsEvent } from "../../shared/types";
import { FOMC, HOLIDAYS } from "../../shared/market";

const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-11-02", h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: 100, rA: null, t: 1, ...p });

describe("monthWeeks", () => {
  it("November 2026 is five Mon–Fri weeks from Nov 2 to Dec 4 (matches the reference calendar)", () => {
    const w = monthWeeks(2026, 10);
    expect(w).toHaveLength(5);
    expect(w[0][0]).toBe("2026-11-02");
    expect(w[4][4]).toBe("2026-12-04");
  });
  it("a month starting midweek begins on that week's Monday", () => {
    expect(monthWeeks(2026, 9)[0][0]).toBe("2026-09-28"); // Oct 1 2026 is a Thursday
  });
  it("weekOf / addDays / daysBetween", () => {
    expect(weekOf("2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-31", "2026-11-06")).toBe(6);
  });
});

describe("results", () => {
  it("upcoming reports have no mark", () => expect(resultOf(ev({}))).toBeNull());
  it("beat = both lines clear consensus", () => expect(resultOf(ev({ eA: 1.1, rA: 101 }))).toBe("beat"));
  it("miss = both fall short", () => expect(resultOf(ev({ eA: 0.9, rA: 99 }))).toBe("miss"));
  it("mixed otherwise", () => expect(resultOf(ev({ eA: 1.1, rA: 99 }))).toBe("mixed"));
  it("EPS-only when revenue is unknown", () => expect(resultOf(ev({ eA: 1.2, rE: null }))).toBe("beat"));
  it("surprise is relative to |estimate|", () => expect(surprise(ev({ eE: -1, eA: -0.5 }))).toBeCloseTo(50));
});

describe("look-through", () => {
  it("finds Apple inside VOO and sizes the dollars", () => {
    const v = heldVia("AAPL", [{ s: "VOO", v: 10000 }]);
    expect(v[0]?.etf).toBe("VOO");
    expect(v[0].dollars).toBeGreaterThan(100);
  });
});

describe("static data", () => {
  it("universe has hundreds of tracked companies with names", () => {
    expect(Object.keys(UNIVERSE).length).toBeGreaterThan(500);
    for (const s of ["AAPL", "NVDA", "MSFT"]) expect(UNIVERSE[s].n).toBeTruthy();
  });
  it("every sector folds into GICS or Other", () => {
    const ok = new Set(["Communication Services", "Consumer Discretionary", "Consumer Staples", "Energy", "Financials", "Health Care", "Industrials", "Information Technology", "Materials", "Real Estate", "Utilities", "Other"]);
    for (const c of Object.values(UNIVERSE)) expect(ok.has(c.sec)).toBe(true);
  });
  it("has ETF holdings for the big index funds", () => { for (const e of ["VOO", "QQQ", "SPY"]) expect(ETFS[e].h.length).toBeGreaterThanOrEqual(5); });
  it("market calendar covers the next 6 months (update shared/market.ts yearly)", () => {
    const horizon = addDays(new Date().toISOString().slice(0, 10), 180);
    expect(FOMC.some((f) => f.date >= horizon) || FOMC[FOMC.length - 1].date >= addDays(horizon, -120)).toBe(true);
    expect(HOLIDAYS[HOLIDAYS.length - 1].date >= horizon).toBe(true);
  });
});
