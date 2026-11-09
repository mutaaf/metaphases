import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import calendar from "../fixtures/calendar-2026-11.json" with { type: "json" };
import { applyToEvents, applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { buildIndex, crossCheck, windowDays, windowEnd, type NqWindow } from "../../shared/crossCheck";
import type { EarningsEvent } from "../../shared/types";

// 0052: Ross Stores announced (Nov 5) Q3 2026 results Thu Nov 19 at about 4:00 pm ET; Finnhub shows Wed Nov 18
// with a blank session. Palo Alto Networks announced (Nov 3) fiscal Q1 2027 after the US close on Wed Nov 18;
// Finnhub has the date but no session (0050). Nasdaq's day calendar agrees with both companies.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-09";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const events = ((calendar as any).events ?? calendar) as EarningsEvent[];

describe("0052 company dates over Finnhub's projection", () => {
  it("the override file still passes its gate today", () => {
    expect(validateOverrides(overridesFile, today)).toEqual([]);
  });

  it("ROST sheet: next report is Thu Nov 19 after the close, estimates kept, source set", () => {
    const out = applyToRows("ROST", [{ symbol: "ROST", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 1.8819, revenueEstimate: 6370684186 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-19", hour: "amc", quarter: 3, year: 2027, epsEstimate: 1.8819 })]);
    expect(out[0].source).toMatch(/^https:\/\//);
  });

  it("ROST calendar: one row, on Nov 19 after the close, none on Nov 18", () => {
    expect(events.filter((e) => e.s === "ROST").map((e) => e.d)).toEqual(["2026-11-18"]); // the recorded Finnhub projection
    const out = applyToEvents(events, FILE, "2026-11-16", "2026-11-20", today).filter((e) => e.s === "ROST");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-19", h: "amc", eE: 1.8734 })]);
    expect(out[0].o).toMatch(/^https:\/\//);
    expect(applyToEvents(events, FILE, "2026-11-16", "2026-11-18", today).filter((e) => e.s === "ROST")).toEqual([]);
  });

  it("PANW: Wed Nov 18 after the close, company-confirmed", () => {
    const rows = applyToRows("PANW", [{ symbol: "PANW", date: "2026-11-18", hour: "", quarter: 1, year: 2027, epsEstimate: 0.9908 }], FILE, today);
    expect(rows).toEqual([expect.objectContaining({ date: "2026-11-18", hour: "amc", epsEstimate: 0.9908 })]);
    expect(rows[0].source).toMatch(/^https:\/\//);
    const out = applyToEvents(events, FILE, "2026-11-16", "2026-11-20", today).filter((e) => e.s === "PANW");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-18", h: "amc", eE: 0.9908 })]);
  });

  it("no 'two calendars disagree' notice once the company's date is in", () => {
    const loaded = windowDays(today);
    const got = Object.fromEntries(loaded.map((d) => [d, d === "2026-11-19" ? { ROST: "amc" as const } : d === "2026-11-18" ? { PANW: "amc" as const } : {}]));
    const w: NqWindow = { from: today, to: windowEnd(today), loaded, idx: buildIndex(got) };
    const out = crossCheck(applyToEvents(events, FILE, "2026-11-16", "2026-11-20", today), w).filter((e) => e.s === "ROST" || e.s === "PANW");
    expect(out).toHaveLength(2);
    for (const e of out) expect(e.x).toBeUndefined();
  });
});
