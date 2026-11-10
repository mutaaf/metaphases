import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import calendar from "../fixtures/calendar-2026-11.json" with { type: "json" };
import { applyToEvents, applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";

// 0055: Alibaba's 6-K of Nov 6 (HKEX board-meeting notice) says results are announced Thu Nov 19; Nasdaq lists
// it pre-market. Gap's Oct 29 release: Thu Nov 19 at about 1:15 pm PT, after the close. Finnhub had BABA on
// Dec 1 (sheet) and Nov 19 / Nov 23 (calendar), and GAP on Wed Nov 18 with no session.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-10";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const events = ((calendar as any).events ?? calendar) as EarningsEvent[];

describe("0055 Alibaba and Gap on their announced dates", () => {
  it("the BABA and GAP entries pass the gate on the day they were added", () => {
    expect(validateOverrides({ BABA: FILE.BABA, GAP: FILE.GAP }, today)).toEqual([]);
  });

  it("BABA sheet: Finnhub's Dec 1 row becomes Thu Nov 19 before the open, estimates kept, source set", () => {
    const out = applyToRows("BABA", [{ symbol: "BABA", date: "2026-12-01", hour: "", quarter: 2, year: 2027, epsEstimate: 11.3708, revenueEstimate: 275486910446 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-19", hour: "bmo", quarter: 2, year: 2027, epsEstimate: 11.3708 })]);
    expect(out[0].source).toMatch(/^https:\/\/www\.sec\.gov\//);
    const next = { date: out[0].date, session: out[0].hour, quarter: 2, year: 2027, epsE: 11.3708, revE: null, confirmed: out[0].source };
    expect(tickerShareTitle("BABA", "Alibaba", next, undefined)).toMatch(/^BABA reports Thu, Nov 19/);
  });

  it("BABA calendar: one row, on Nov 19, in every range that includes Nov 19 or Finnhub's dates; none in December", () => {
    const dec1 = { s: "BABA", d: "2026-12-01", h: "" as const, q: 2, y: 2027, eE: 11.3708, eA: null, rE: 275486910446, rA: null, t: 1 as const };
    const all = [...events, dec1];
    for (const [from, to] of [["2026-11-01", "2026-11-30"], ["2026-11-16", "2026-12-12"], ["2026-11-16", "2026-11-20"]]) {
      const out = applyToEvents(all, FILE, from, to, today).filter((e) => e.s === "BABA");
      expect(out, `${from}..${to}`).toEqual([expect.objectContaining({ d: "2026-11-19", h: "bmo", q: 2, y: 2027 })]);
      expect(out[0].o).toMatch(/^https:\/\//);
    }
    expect(applyToEvents(all, FILE, "2026-11-30", "2026-12-31", today).filter((e) => e.s === "BABA")).toEqual([]);
    expect(applyToEvents(all, FILE, "2026-11-23", "2026-11-27", today).filter((e) => e.s === "BABA")).toEqual([]);
  });

  it("GAP: Thu Nov 19 after the close on the sheet and the calendar, nothing on Wed Nov 18", () => {
    const rows = applyToRows("GAP", [{ symbol: "GAP", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 0.7927 }], FILE, today);
    expect(rows).toEqual([expect.objectContaining({ date: "2026-11-19", hour: "amc", quarter: 3, year: 2027, epsEstimate: 0.7927 })]);
    expect(rows[0].source).toMatch(/^https:\/\/s204\.q4cdn\.com\//);
    expect(events.filter((e) => e.s === "GAP").map((e) => e.d)).toEqual(["2026-11-18"]); // the recorded Finnhub projection
    const out = applyToEvents(events, FILE, "2026-11-16", "2026-11-20", today).filter((e) => e.s === "GAP");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-19", h: "amc", eE: 0.7879 })]);
    expect(applyToEvents(events, FILE, "2026-11-16", "2026-11-18", today).filter((e) => e.s === "GAP")).toEqual([]);
  });
});
