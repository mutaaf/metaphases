import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import calendar from "../fixtures/calendar-2026-11.json" with { type: "json" };
import { applyToEvents, applyToRows, type DateOverrides } from "../../shared/dateOverrides";
import type { EarningsEvent } from "../../shared/types";

// 0048: Brookfield Corporation announced Thu Nov 12 (results ~7:00 am ET, call 10:00 am ET); Finnhub shows
// Tue Nov 10 with a blank session. Hesai announced Tue Nov 10 before the US open; Finnhub shows Nov 9.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-06";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const events = ((calendar as any).events ?? calendar) as EarningsEvent[];

describe("0048 company dates over Finnhub's projection", () => {
  it("BN sheet: next report is Thu Nov 12 before the open, estimates kept", () => {
    const out = applyToRows("BN", [{ symbol: "BN", date: "2026-11-10", hour: "", quarter: 3, year: 2026, epsEstimate: 0.7442, revenueEstimate: 1853619930 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-12", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 0.7442 })]);
  });

  it("BN calendar: one row, on Nov 12, none on Nov 10", () => {
    const fixtureBn = events.filter((e) => e.s === "BN");
    expect(fixtureBn.map((e) => e.d)).toEqual(["2026-11-10"]); // the recorded Finnhub projection
    const out = applyToEvents(events, FILE, "2026-11-06", "2026-11-13", today).filter((e) => e.s === "BN");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-12", h: "bmo", eE: 0.7442 })]);
    expect(out[0].o).toMatch(/^https:\/\//);
  });

  it("BN drops out of a range that ends before Nov 12", () => {
    expect(applyToEvents(events, FILE, "2026-11-09", "2026-11-11", today).filter((e) => e.s === "BN")).toEqual([]);
  });

  it("HSAI: Tue Nov 10 before the US open, not Mon Nov 9", () => {
    const out = applyToEvents(events, FILE, "2026-11-09", "2026-11-13", today).filter((e) => e.s === "HSAI");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-10", h: "bmo", eE: 1.2175 })]);
  });
});
