import { describe, expect, it } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, applyToRows, callSession, overrideSession, type DateOverride, type DateOverrides } from "../../shared/dateOverrides";
import { buildIndex, crossCheck, windowDays, windowEnd, type NqWindow } from "../../shared/crossCheck";
import type { EarningsEvent } from "../../shared/types";

// 0108: a company-dated row with no stated session read "time not announced", though the company's own notice gives
// the call time and Nasdaq times the report too (DELL, ADSK, DE, MRVL, M on Nov 24). The session for a company date is,
// in order: the override's `hour`, then the call time (a call at 4:00 p.m. ET or later = after the close; before
// 9:30 a.m. ET = before the open), then Nasdaq's timed listing for that day (expected, `hs: "n"`), else blank.

describe("callSession", () => {
  it("reads a call at or after 4 p.m. ET (any zone) as after the close", () => {
    expect(callSession("3:30 p.m. CT")).toBe("amc"); // DELL: 4:30 p.m. ET
    expect(callSession("2 p.m. PT")).toBe("amc"); // ADSK: 5 p.m. ET
    expect(callSession("1:30 p.m. PT")).toBe("amc"); // MRVL: 4:30 p.m. ET
    expect(callSession("4 p.m. ET")).toBe("amc");
    expect(callSession("2 p.m. MT")).toBe("amc");
  });

  it("reads a call before 9:30 a.m. ET as before the open", () => {
    expect(callSession("8:00 a.m. ET")).toBe("bmo");
    expect(callSession("8 a.m. ET")).toBe("bmo"); // M
    expect(callSession("7:30 a.m. CT")).toBe("bmo"); // 8:30 ET
    expect(callSession("9:29 a.m. ET")).toBe("bmo");
    expect(callSession("12:30 a.m. ET")).toBe("bmo");
    expect(callSession("12 a.m. ET")).toBe("bmo");
  });

  it("never guesses a session for a call during market hours", () => {
    expect(callSession("12:00 p.m. ET")).toBeUndefined();
    expect(callSession("9 a.m. CT")).toBeUndefined(); // DE: 10 a.m. ET
    expect(callSession("9:30 a.m. ET")).toBeUndefined();
    expect(callSession("3:59 p.m. ET")).toBeUndefined();
    expect(callSession("12 p.m. PT")).toBeUndefined(); // 3 p.m. ET
  });

  it("is undefined for nothing or a time it can't read", () => {
    expect(callSession(undefined)).toBeUndefined();
    expect(callSession("")).toBeUndefined();
    expect(callSession("half past four")).toBeUndefined();
  });
});

const ov = (extra: Partial<DateOverride>): DateOverride => ({ date: "2026-11-24", quarter: 3, year: 2027, source: "https://example.com/notice", checked: "2026-11-16", ...extra });

describe("overrideSession", () => {
  it("prefers the company's stated session over its call time", () => {
    expect(overrideSession(ov({ hour: "bmo", call: "5 p.m. ET" }))).toBe("bmo");
    expect(overrideSession(ov({ call: "5 p.m. ET" }))).toBe("amc");
    expect(overrideSession(ov({ call: "11 a.m. ET" }))).toBe("");
    expect(overrideSession(ov({}))).toBe("");
  });
});

const FILE = overridesFile as unknown as DateOverrides;

describe("company-dated rows take the call time's session", () => {
  it("DELL and ADSK on Nov 24 after the close; Deere's 10 a.m. ET call says nothing; Macy's 8 a.m. ET call is before the open", () => {
    const today = "2026-11-24";
    const feed: EarningsEvent[] = [
      { s: "DELL", d: "2026-11-24", h: "", q: 3, y: 2027, eE: 2.5, eA: null, rE: 1, rA: null, t: 1 },
      { s: "ADSK", d: "2026-11-24", h: "", q: 3, y: 2027, eE: 2.5, eA: null, rE: 1, rA: null, t: 1 },
      { s: "DE", d: "2026-11-25", h: "amc", q: 4, y: 2026, eE: 4, eA: null, rE: 1, rA: null, t: 1 },
    ];
    const out = applyToEvents(feed, FILE, "2026-11-23", "2026-12-04", today);
    const h = (s: string) => out.find((e) => e.s === s)?.h;
    expect(h("DELL")).toBe("amc");
    expect(h("ADSK")).toBe("amc");
    expect(h("DE")).toBe("");
    expect(h("MRVL")).toBe("amc");
    expect(h("M")).toBe("bmo");
  });

  it("the sheet's rows agree", () => {
    const rows = applyToRows("DELL", [{ symbol: "DELL", date: "2026-11-23", hour: "", quarter: 3, year: 2027, epsEstimate: 2.5, epsActual: null, revenueEstimate: 1, revenueActual: null }], FILE, "2026-11-20");
    expect(rows[0]).toMatchObject({ date: "2026-11-24", hour: "amc" });
  });
});

describe("crossCheck: a company date with no session takes Nasdaq's timed listing that day", () => {
  const TODAY = "2026-11-24";
  const win = (days: Record<string, Record<string, EarningsEvent["h"]>>): NqWindow => {
    const loaded = windowDays(TODAY);
    return { from: TODAY, to: windowEnd(TODAY), loaded, idx: buildIndex(Object.fromEntries(loaded.map((d) => [d, days[d] ?? {}]))) };
  };
  const row = (s: string, d: string, h: EarningsEvent["h"] = "", extra: Partial<EarningsEvent> = {}): EarningsEvent =>
    ({ s, d, h, q: 4, y: 2026, eE: 4, eA: null, rE: 1, rA: null, t: 1, o: "https://example.com/notice", ...extra });

  it("fills Deere's blank session from Nasdaq's pre-market listing, marked expected, and leaves the date alone", () => {
    const [de] = crossCheck([row("DE", "2026-11-25")], win({ "2026-11-25": { DE: "bmo" } }));
    expect(de).toMatchObject({ s: "DE", d: "2026-11-25", h: "bmo", hs: "n" });
    expect(de.x).toBeUndefined();
    expect(de.xd).toBeUndefined();
  });

  it("never overrides a company session, never moves a date, never fills from another day or an untimed listing", () => {
    const w = win({ "2026-11-25": { DE: "amc", X: "" }, "2026-11-26": { Y: "bmo" } });
    expect(crossCheck([row("DE", "2026-11-25", "bmo")], w)[0]).toEqual(row("DE", "2026-11-25", "bmo"));
    expect(crossCheck([row("X", "2026-11-25")], w)[0]).toEqual(row("X", "2026-11-25"));
    expect(crossCheck([row("Y", "2026-11-25")], w)[0]).toEqual(row("Y", "2026-11-25"));
    // The report day itself: Nasdaq's guess would decide when results are "due" (0039), so it isn't filled (review of #193).
    expect(crossCheck([row("DE", TODAY)], win({ [TODAY]: { DE: "bmo" } }))[0]).toEqual(row("DE", TODAY));
    // Figures in: settled, left alone.
    const done = row("DE", "2026-11-25", "", { eA: 4.1 });
    expect(crossCheck([done], win({ "2026-11-25": { DE: "bmo" } }))[0]).toEqual(done);
  });
});
