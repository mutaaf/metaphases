import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import calendar from "../fixtures/calendar-2026-11.json" with { type: "json" };
import { applyToEvents, applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";

// 0056: QXO's Form 8-K of Nov 9 (preliminary Q3 2026 results) says it expects to report full Q3 2026 results on
// Nov 12, 2026, and names no session. Finnhub projects Tue Nov 17 with no session; Nasdaq agrees with Nov 12.
// Aggregators' "after the close" is not a company fact, so the entry carries no `hour` and the row stays
// "session unknown" (0008).

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-10";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const events = ((calendar as any).events ?? calendar) as EarningsEvent[];

describe("0056 QXO on its announced date", () => {
  it("the QXO entry passes the gate on the day it was added, with no session invented", () => {
    expect(FILE.QXO).toBeDefined();
    expect(validateOverrides({ QXO: FILE.QXO }, today)).toEqual([]);
    expect(FILE.QXO.hour).toBeUndefined();
    expect(FILE.QXO.source).toMatch(/^https:\/\/www\.sec\.gov\//);
  });

  it("an entry may leave the session out, but a session it gives must be real", () => {
    const base = { date: "2026-11-12", quarter: 3, year: 2026, source: "https://x.com/a", checked: "2026-11-10" };
    expect(validateOverrides({ A: base }, today)).toEqual([]);
    expect(validateOverrides({ B: { ...base, hour: "late" } }, today)).toEqual([expect.stringMatching(/^B: hour/)]);
    expect(validateOverrides({ C: { ...base, hour: "" } }, today)).toEqual([expect.stringMatching(/^C: hour/)]);
  });

  it("QXO sheet: Finnhub's Nov 17 row becomes Thu Nov 12, session unknown, estimates kept, source set", () => {
    const out = applyToRows("QXO", [{ symbol: "QXO", date: "2026-11-17", hour: "", quarter: 3, year: 2026, epsEstimate: 0.136, revenueEstimate: 4894775120 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-12", hour: "", quarter: 3, year: 2026, epsEstimate: 0.136 })]);
    expect(out[0].source).toMatch(/^https:\/\//);
    const next = { date: out[0].date, session: out[0].hour, quarter: 3, year: 2026, epsE: 0.136, revE: null, confirmed: out[0].source };
    expect(tickerShareTitle("QXO", "QXO, Inc.", next, undefined)).toMatch(/^QXO reports Thu, Nov 12/);
  });

  it("QXO sheet with no Finnhub row: the company's date still shows, session unknown", () => {
    expect(applyToRows("QXO", [], FILE, today)).toEqual([expect.objectContaining({ date: "2026-11-12", hour: "", quarter: 3, year: 2026, epsEstimate: null })]);
  });

  it("QXO calendar: exactly one row, on Nov 12, none on Nov 17", () => {
    expect(events.filter((e) => e.s === "QXO").map((e) => e.d)).toEqual(["2026-11-17"]); // the recorded Finnhub projection
    const out = applyToEvents(events, FILE, "2026-11-10", "2026-11-20", today).filter((e) => e.s === "QXO");
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-12", h: "", q: 3, y: 2026, eE: 0.132 })]);
    expect(out[0].o).toMatch(/^https:\/\//);
    expect(applyToEvents(events, FILE, "2026-11-16", "2026-11-20", today).filter((e) => e.s === "QXO")).toEqual([]);
  });
});
