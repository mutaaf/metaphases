import { describe, expect, it } from "vitest";
import { figuresPending, noResultYet } from "../../shared/pending";

// 0040: ADM reported before the open on Tue Nov 3; twelve hours later the calendar still had no figures and
// the row read "Before open", like a company that hadn't reported. Once the session is over, it's "figures pending".
const ADM = { s: "ADM", d: "2026-11-03", h: "bmo", eA: null as number | null, rA: null as number | null };
const nyMin = (utc: string) => { // minutes after NY midnight for a UTC time on Nov 3 (EST, UTC−5)
  const [h, m] = utc.split(":").map(Number);
  return (h - 5) * 60 + m;
};

describe("figuresPending", () => {
  it("bmo today: pending at 16:00Z, not at 13:00Z", () => {
    expect(figuresPending(ADM, "2026-11-03", nyMin("16:00"))).toBe(true);
    expect(figuresPending(ADM, "2026-11-03", nyMin("13:00"))).toBe(false);
  });
  it("figures in: never pending", () => {
    expect(figuresPending({ ...ADM, eA: 1.77 }, "2026-11-03", nyMin("16:00"))).toBe(false);
    expect(figuresPending({ ...ADM, rA: 22.34e9 }, "2026-11-03", nyMin("16:00"))).toBe(false);
  });
  it("amc today waits for 5 pm ET; dmh for 4 pm; an unknown session today is never assumed", () => {
    expect(figuresPending({ ...ADM, h: "amc" }, "2026-11-03", 16 * 60 + 59)).toBe(false);
    expect(figuresPending({ ...ADM, h: "amc" }, "2026-11-03", 17 * 60)).toBe(true);
    expect(figuresPending({ ...ADM, h: "dmh" }, "2026-11-03", 16 * 60)).toBe(true);
    expect(figuresPending({ ...ADM, h: "" }, "2026-11-03", 23 * 60)).toBe(false);
  });
  it("an earlier day is pending until noResultYet takes over (2 trading days), across a weekend", () => {
    const fri = { ...ADM, d: "2026-10-30", h: "amc" };
    expect(figuresPending(fri, "2026-10-31", 0)).toBe(true); // Saturday
    expect(figuresPending(fri, "2026-11-02", 0)).toBe(true); // Monday: 1 trading day
    expect(figuresPending(fri, "2026-11-03", 0)).toBe(false); // Tuesday: "No figures yet"
    expect(noResultYet(fri, "2026-11-03")).toBe(true);
  });
  it("a row whose day or session Nasdaq disputes keeps its mark, not pending", () => {
    expect(figuresPending({ ...ADM, x: "differs" }, "2026-11-03", nyMin("16:00"))).toBe(false);
    expect(figuresPending({ ...ADM, x: "agree" }, "2026-11-03", nyMin("16:00"))).toBe(true);
  });
  it("an earlier day with a blank session is pending too (the day is over; same as the sheet's reportOutcome)", () => {
    expect(figuresPending({ ...ADM, d: "2026-11-02", h: "" }, "2026-11-03", 0)).toBe(true);
  });
  it("a future day, a holiday row or a passed projection is never pending", () => {
    expect(figuresPending({ ...ADM, d: "2026-11-04" }, "2026-11-03", 23 * 60)).toBe(false);
    expect(figuresPending({ ...ADM, c: "Thanksgiving" }, "2026-11-03", 23 * 60)).toBe(false);
    expect(figuresPending({ ...ADM, od: true }, "2026-11-03", 23 * 60)).toBe(false);
  });
});

// 0040's second half (APO: `rA` $1.374B against a $5.86B estimate) is held by 0011's revenue-basis guard;
// pinned here so the ticket's acceptance stays proven: no verdict, no tint, not counted in the scoreboard.
import { revenueBeatRate, revenueComparable, revenueVerdict } from "../../shared/compare";
describe("APO-shaped revenue (rA/rE = 0.23)", () => {
  const apo = { s: "APO", rA: 1.374e9, rE: 5.86e9 };
  it("is not comparable and not counted", () => {
    expect(revenueVerdict(apo, "USD")).toBe("not-comparable");
    expect(revenueComparable(apo, "USD")).toBe(false);
    expect(revenueBeatRate([apo, { s: "X", rA: 1.1e9, rE: 1e9 }])).toMatchObject({ beats: 1, judged: 1, excluded: 1 });
  });
});

import { pickStories } from "../../src/lib/stories";
describe("Today's story cards", () => {
  it("drop a report whose session passed today with no figures (never 'reports today')", () => {
    const ev = { ...ADM, q: 3, y: 2026, eE: 1.84, rE: null, t: 1 as const };
    const o = { events: [ev], macro: null, watch: [], holdings: [], today: "2026-11-03", horizon: "2026-11-09", mcap: () => 1, heldVia: () => [] };
    expect(pickStories({ ...o, nowMin: nyMin("13:00") }).some((x) => x.kind === "report")).toBe(true);
    expect(pickStories({ ...o, nowMin: nyMin("16:00") }).some((x) => x.kind === "report")).toBe(false);
  });
});
