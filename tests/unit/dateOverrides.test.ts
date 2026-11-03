import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { activeOverrides, applyToEvents, applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import type { EarningsEvent } from "../../shared/types";

// 0013: Finnhub's free calendar often shows a projected date. When the company has announced a different
// one (ARM: Finnhub Nov 5, Arm's newsroom Nov 4 after the close), the company's date wins.

const ARM_SRC = "https://newsroom.arm.com/news/arm-announces-earnings-release-date-for-second-quarter-fiscal-year-ending-2027";
const O: DateOverrides = {
  ARM: { date: "2026-11-04", hour: "amc", quarter: 2, year: 2027, source: ARM_SRC, checked: "2026-11-03" },
  AXON: { date: "2026-11-05", hour: "amc", quarter: 3, year: 2026, source: "https://investingnews.com/axon-to-release-third-quarter-2026-earnings-on-november-5-2026/", checked: "2026-11-03" },
};
const ev = (s: string, d: string, h: EarningsEvent["h"] = "", q = 2, y = 2027): EarningsEvent => ({ s, d, h, q, y, eE: 0.48, eA: null, rE: 1.39e9, rA: null, t: 1 });
const row = (symbol: string, date: string, hour = "", quarter = 2, year = 2027) => ({ symbol, date, hour, quarter, year, epsEstimate: 0.48, epsActual: null, revenueEstimate: 1.39e9, revenueActual: null });

describe("date overrides on the calendar", () => {
  it("moves ARM from Finnhub's Nov 5 to the company's Nov 4 after the close, keeping its estimates", () => {
    const out = applyToEvents([ev("ARM", "2026-11-05"), ev("MSFT", "2026-11-05", "amc")], O, "2026-11-02", "2026-11-06", "2026-11-02");
    const arm = out.filter((e) => e.s === "ARM");
    expect(arm).toHaveLength(1);
    expect(arm[0]).toMatchObject({ d: "2026-11-04", h: "amc", eE: 0.48, rE: 1.39e9, o: ARM_SRC });
    expect(out.find((e) => e.s === "MSFT")?.d).toBe("2026-11-05");
  });

  it("adds the report when Finnhub has no row for that quarter (AXON), with no invented estimates", () => {
    const out = applyToEvents([], O, "2026-11-02", "2026-11-06", "2026-11-03");
    const axon = out.find((e) => e.s === "AXON")!;
    expect(axon).toMatchObject({ d: "2026-11-05", h: "amc", q: 3, y: 2026, eE: null, rE: null, t: 1 });
  });

  it("removes a stale projected row for the same quarter even when it's weeks away (AXON's Nov 2)", () => {
    const out = applyToEvents([ev("AXON", "2026-11-02", "", 3, 2026)], O, "2026-11-02", "2026-11-06", "2026-11-03");
    expect(out.filter((e) => e.s === "AXON").map((e) => e.d)).toEqual(["2026-11-05"]);
  });

  it("leaves a different quarter alone (AXON's Q4 in February)", () => {
    const out = applyToEvents([ev("AXON", "2027-02-22", "amc", 4, 2026)], O, "2027-02-01", "2027-02-28", "2026-11-03");
    expect(out.map((e) => e.d)).toEqual(["2027-02-22"]);
  });

  it("doesn't add the override outside the requested range, but still drops the wrong row", () => {
    const out = applyToEvents([ev("ARM", "2026-11-05")], O, "2026-11-05", "2026-11-06", "2026-11-02");
    expect(out.filter((e) => e.s === "ARM")).toEqual([]);
  });

  it("keeps the row on the company's date whatever the order, and prefers a row with results over a projection", () => {
    for (const evs of [[ev("ARM", "2026-11-05"), ev("ARM", "2026-11-04", "amc")], [ev("ARM", "2026-11-04", "amc"), ev("ARM", "2026-11-05")]]) {
      expect(applyToEvents(evs, O, "2026-11-02", "2026-11-06", "2026-11-02").filter((e) => e.s === "ARM").map((e) => e.d)).toEqual(["2026-11-04"]);
    }
    const reported = { ...ev("ARM", "2026-11-03"), eA: 0.51 };
    const out = applyToEvents([ev("ARM", "2026-11-05"), reported], O, "2026-11-02", "2026-11-06", "2026-11-06");
    expect(out.filter((e) => e.s === "ARM")).toEqual([expect.objectContaining({ d: "2026-11-04", eA: 0.51 })]);
  });

  it("is a no-op when Finnhub agrees", () => {
    const out = applyToEvents([ev("ARM", "2026-11-04", "amc")], O, "2026-11-02", "2026-11-06", "2026-11-02");
    expect(out.filter((e) => e.s === "ARM")).toHaveLength(1);
    expect(out.find((e) => e.s === "ARM")).toMatchObject({ d: "2026-11-04", h: "amc" });
  });

  it("expires two weeks after the override date", () => {
    expect(Object.keys(activeOverrides(O, "2026-11-18"))).toEqual(["ARM", "AXON"]);
    expect(Object.keys(activeOverrides(O, "2026-11-19"))).toEqual(["AXON"]);
    expect(Object.keys(activeOverrides(O, "2026-11-20"))).toEqual([]);
    const late = applyToEvents([ev("ARM", "2026-11-05")], O, "2026-11-02", "2026-11-06", "2026-11-20");
    expect(late.map((e) => e.d)).toEqual(["2026-11-05"]);
  });
});

describe("date overrides on the sheet's Finnhub rows", () => {
  it("makes the company's date the next report, with its session and source", () => {
    const rows = applyToRows("ARM", [row("ARM", "2026-11-05")], O, "2026-11-02");
    expect(rows).toEqual([expect.objectContaining({ symbol: "ARM", date: "2026-11-04", hour: "amc", quarter: 2, year: 2027, epsEstimate: 0.48, source: ARM_SRC })]);
  });

  it("puts AXON's Nov 5 ahead of Finnhub's February row instead of skipping a quarter", () => {
    const rows = applyToRows("AXON", [row("AXON", "2027-02-22", "amc", 4, 2026)], O, "2026-11-03");
    const next = rows.filter((r) => r.date >= "2026-11-03").sort((a, b) => a.date.localeCompare(b.date))[0];
    expect(next).toMatchObject({ date: "2026-11-05", hour: "amc", quarter: 3, year: 2026, epsEstimate: null });
  });

  it("leaves other symbols untouched", () => {
    const rows = [row("MSFT", "2026-11-05")];
    expect(applyToRows("MSFT", rows, O, "2026-11-02")).toBe(rows);
  });
});

describe("validateOverrides", () => {
  it("rejects an entry without a source, a bad session or a stale check", () => {
    const errs = validateOverrides({
      A: { date: "2026-11-04", hour: "amc", quarter: 1, year: 2027, checked: "2026-11-03" },
      B: { date: "2026-11-04", hour: "late", quarter: 1, year: 2027, source: "https://x.com/a", checked: "2026-11-03" },
      C: { date: "2026-12-20", hour: "bmo", quarter: 1, year: 2027, source: "https://x.com/c", checked: "2026-10-01" },
      D: { date: "2026-11-04", hour: "bmo", quarter: 1, year: 2027, source: "http://x.com/d", checked: "2026-11-03" },
    }, "2026-11-03");
    expect(errs.some((e) => e.startsWith("A:") && /source/.test(e))).toBe(true);
    expect(errs.some((e) => e.startsWith("B:") && /hour/.test(e))).toBe(true);
    expect(errs.some((e) => e.startsWith("C:") && /checked/.test(e))).toBe(true);
    expect(errs.some((e) => e.startsWith("D:") && /source/.test(e))).toBe(true);
    expect(validateOverrides(O, "2026-11-03")).toEqual([]);
  });

  it("rejects a weekend date and a checked date in the future, and ignores a stale check on an expired entry", () => {
    const errs = validateOverrides({
      W: { date: "2026-11-07", hour: "amc", quarter: 1, year: 2027, source: "https://x.com/w", checked: "2026-11-03" },
      F: { date: "2026-11-04", hour: "amc", quarter: 1, year: 2027, source: "https://x.com/f", checked: "2062-11-03" },
      X: { date: "2026-09-01", hour: "amc", quarter: 1, year: 2027, source: "https://x.com/x", checked: "2026-08-01" },
    }, "2026-11-03");
    expect(errs.some((e) => e.startsWith("W:") && /weekend/.test(e))).toBe(true);
    expect(errs.some((e) => e.startsWith("F:") && /future/.test(e))).toBe(true);
    expect(errs.some((e) => e.startsWith("X:"))).toBe(false);
  });

  it("the committed data/date-overrides.json is valid today", () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    expect(validateOverrides(overridesFile as unknown, today)).toEqual([]);
  });
});
