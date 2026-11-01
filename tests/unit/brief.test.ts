import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { briefWeek, buildBrief, largestSP } from "../../src/lib/brief";
import type { Co } from "../../src/lib/data";
import { monthWeeks, weekOf } from "../../src/lib/dates";
import { UNIVERSE } from "../../src/lib/data";
import type { CalendarResponse, EarningsEvent, MacroResponse } from "../../shared/types";

const fx = <T>(n: string): T => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8"));
const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-11-02", h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: 100, rA: null, t: 1, ...p });
const c = (n: string, mc: number, sp = true): Co => ({ n, logo: "", mc, ind: "", sec: "", c: "US", web: "", sp });

const U: Record<string, Co> = {
  BIG: c("Big Co", 900), GOOGL: c("Alphabet", 800), GOOG: c("Alphabet", 800), MID: c("Mid Co", 500),
  SML: c("Small Co", 100), NOSP: c("Off-index Co", 700, false), A: c("A Co", 50), B: c("B Co", 40),
};
const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

describe("briefWeek", () => {
  const nov = monthWeeks(2026, 10);
  it("a weekday anchor gives the week holding it", () => expect(briefWeek(nov, "2026-11-04")).toEqual(week));
  it("a weekend anchor rolls forward to the next week (like the month grid)", () => expect(briefWeek(nov, "2026-11-01")).toEqual(week));
  it("an anchor past the last displayed week falls back to that week", () => expect(briefWeek(monthWeeks(2026, 9), "2026-10-31")[0]).toBe("2026-10-26"));
  it("week and day views show one week", () => expect(briefWeek([weekOf("2026-11-12")], "2026-11-12")[0]).toBe("2026-11-09"));
});

describe("buildBrief", () => {
  const events = [
    ev({ s: "SML", d: "2026-11-02" }), ev({ s: "GOOG", d: "2026-11-03" }), ev({ s: "GOOGL", d: "2026-11-03" }),
    ev({ s: "BIG", d: "2026-11-05", h: "bmo" }), ev({ s: "NOSP", d: "2026-11-04" }), ev({ s: "UNTRACKED", d: "2026-11-04", t: 0 }),
    ev({ s: "MID", d: "2026-11-09" }), // next week: excluded
  ];
  const macro: MacroResponse = {
    events: [
      { key: "jobs", name: "Jobs report", date: "2026-11-06", kind: "jobs", blurb: "" },
      { key: "jolts", name: "Job openings", date: "2026-11-03", kind: "jobs", blurb: "" },
      { key: "cpi", name: "CPI", date: "2026-11-12", kind: "inflation", blurb: "" },
    ],
    mood: { score: 40, label: "Fear", components: [], history: [60, 51, 50, 49, 48, 47, 40] },
    holidays: [], asOf: "", warnings: [],
  };
  const T = "2026-10-31";
  const b = buildBrief(week, events, [], macro, U, T);

  it("counts every company reporting this week, and only this week; share classes once", () => expect(b.total).toBe(5));
  it("a complete week has no missing days and a covered economic calendar", () => { expect(b.missingDays).toEqual([]); expect(b.macroComplete).toBe(true); });
  it("days that failed to load (calendar warnings) are flagged, holidays aside", () => {
    const p = buildBrief(weekOf("2026-11-23"), [], ["Couldn't load 2026-11-24 — showing the rest.", "Couldn't load 2026-11-26 — showing the rest.", "Couldn't load 2026-12-01 — showing the rest."], macro, U, T);
    expect(p.missingDays).toEqual(["2026-11-24"]);
  });
  it("the economic calendar can't vouch for weeks outside its window or when it warns", () => {
    expect(buildBrief(weekOf("2026-08-03"), events, [], macro, U, T).macroComplete).toBe(false);
    expect(buildBrief(weekOf("2027-06-07"), events, [], macro, U, T).macroComplete).toBe(false);
    expect(buildBrief(week, events, [], { ...macro, warnings: ["FRED offline"] }, U, T).macroComplete).toBe(false);
  });
  it("ranks the biggest reporters by market cap, one row per company", () => {
    expect(b.top.map((t) => t.s)).toEqual(["BIG", "GOOG", "NOSP", "SML"]);
    expect(b.top[0]).toMatchObject({ d: "2026-11-05", h: "bmo", name: "Big Co" });
  });
  it("counts S&P 500 companies (share classes once) and which of the largest report", () => {
    expect(b.sp).toBe(3); // BIG, Alphabet, SML
    expect(b.largest.of).toBe(6); // 6 distinct S&P companies in this toy universe
    expect(b.largest.reporting).toEqual(["BIG", "GOOG", "SML"]);
  });
  it("lists this week's macro events in date order", () => expect(b.macro.map((m) => m.key)).toEqual(["jolts", "jobs"]));
  it("reports Market Mood with its 5-trading-day change", () => expect(b.mood).toEqual({ score: 40, label: "Fear", change5d: -11 }));
  it("is graceful without macro data", () => {
    const n = buildBrief(week, events, [], null, U, T);
    expect(n.macroComplete).toBe(false);
    expect(n.mood).toBeNull();
    expect(n.macro).toEqual([]);
  });
  it("an empty holiday week has no reporters but names the holiday", () => {
    const thanksgiving = weekOf("2026-11-23");
    const e = buildBrief(thanksgiving, [], [], null, U, T);
    expect(e.missingDays).toEqual([]);
    expect(e.total).toBe(0);
    expect(e.top).toEqual([]);
    expect(e.holidays).toEqual([{ date: "2026-11-26", name: "Thanksgiving" }]);
  });
});

describe("buildBrief on recorded fixtures (week of Nov 2, 2026)", () => {
  const cal = fx<CalendarResponse>("calendar-2026-11.json");
  const b = buildBrief(week, cal.events, cal.warnings, fx<MacroResponse>("macro.json"), UNIVERSE, "2026-10-31");
  it("matches the fixture's own counts", () => {
    expect(b.total).toBe(336);
    expect(b.top[0].s).toBe("AAPL");
    expect(b.top).toHaveLength(5);
    expect(b.largest.of).toBe(10);
    expect(b.largest.reporting).toEqual(["AAPL"]);
    expect(b.macro.map((m) => m.key)).toEqual(["jolts", "jobs"]);
  });
  it("the real 10 largest count Alphabet once", () => {
    const flat = largestSP(UNIVERSE).map((g) => g.join("/"));
    expect(flat.filter((g) => g.includes("GOOG"))).toHaveLength(1);
  });
});
