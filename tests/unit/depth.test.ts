import { describe, expect, it } from "vitest";
import { buildIcs, cardSvg, downsample, foldLine, peersFor, placeMarkers, quartersFrom, rollingSma, seasonScore, shapeChart } from "../../shared/depth";
import type { EarningsEvent, Reaction } from "../../shared/types";

const ev = (p: Partial<EarningsEvent>): EarningsEvent => ({ s: "X", d: "2026-11-10", h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: 100, rA: null, t: 1, ...p });
const day = (iso: string) => Math.floor(new Date(iso + "T20:00:00Z").getTime() / 1000); // 4 PM ET-ish close

describe("chart shaping", () => {
  it("downsample keeps first and last and caps the length", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(xs, 250);
    expect(d).toHaveLength(250);
    expect(d[0]).toBe(0);
    expect(d[249]).toBe(999);
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
  it("rollingSma matches a hand computation and is null before enough history", () => {
    const s = rollingSma([1, 2, 3, 4, 5], 3);
    expect(s).toEqual([null, null, 2, 3, 4]);
  });
  it("shapeChart returns ≤ 260 aligned points with averages computed on the full history", () => {
    const n = 500;
    const t = Array.from({ length: n }, (_, i) => 1_700_000_000 + i * 86400);
    const c = Array.from({ length: n }, (_, i) => 100 + i);
    const ch = shapeChart(t, c)!;
    expect(ch.c.length).toBeLessThanOrEqual(260);
    expect(ch.t.length).toBe(ch.c.length);
    expect(ch.s200[0]).not.toBeNull(); // the window starts 248 days in, so the 200-day already exists
    expect(ch.c[ch.c.length - 1]).toBe(599);
  });
  it("shapeChart refuses tiny histories", () => expect(shapeChart([1, 2], [1, 2])).toBeNull());
});

describe("placeMarkers", () => {
  const t = ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21", "2026-08-25", "2026-08-26", "2026-08-27"].map(day);
  const r = (date: string): Reaction => ({ date, session: "amc", period: "Q", epsE: 1, epsA: 1.1, surprisePct: 10, move: 2 });
  it("snaps each report to its trading day and skips ones outside the window", () => {
    const m = placeMarkers(t, [r("2026-08-26"), r("2026-05-20"), r("2025-11-19"), r("Q3 2026")]);
    expect(m.map((x) => x.i)).toEqual([5, 2]);
  });
});

describe("peersFor", () => {
  const sec: Record<string, string> = { AAPL: "IT", MSFT: "IT", NVDA: "IT", ORCL: "IT", XOM: "Energy" };
  const mc: Record<string, number> = { AAPL: 4, MSFT: 3, NVDA: 5, ORCL: 1, XOM: 2 };
  const events = [ev({ s: "MSFT", d: "2026-11-05" }), ev({ s: "ORCL", d: "2026-11-20" }), ev({ s: "XOM", d: "2026-11-06" }), ev({ s: "NVDA", d: "2026-11-30" }), ev({ s: "AAPL", d: "2026-11-10" }), ev({ s: "MSFT", d: "2026-11-05" })];
  it("same sector, within ±7 days, deduped, never itself, date order", () => {
    const p = peersFor("AAPL", "2026-11-10", events, (s) => sec[s], (s) => mc[s]);
    expect(p.map((e) => e.s)).toEqual(["MSFT"]);
    const wide = peersFor("AAPL", "2026-11-13", events, (s) => sec[s], (s) => mc[s]);
    expect(wide.map((e) => e.s)).toEqual(["ORCL"]);
  });
  it("no sector → no peers", () => expect(peersFor("ZZZ", "2026-11-10", events, (s) => sec[s], () => 0)).toEqual([]));
});

describe("quartersFrom", () => {
  it("joins series by period, scales revenue by shares and margins to percent", () => {
    const q = quartersFrom({ eps: [{ period: "2026-06-27", v: 2 }, { period: "2026-03-28", v: 1.5 }], salesPerShare: [{ period: "2026-06-27", v: 7 }], grossMargin: [{ period: "2026-06-27", v: 0.48 }] }, 1000);
    expect(q.map((x) => x.period)).toEqual(["2026-03-28", "2026-06-27"]);
    expect(q[1].rev).toBe(7 * 1000 * 1e6);
    expect(q[1].gm).toBe(48);
    expect(q[0].rev).toBeNull();
  });
  it("handles a missing series", () => expect(quartersFrom(undefined, 1)).toEqual([]));
});

describe("ICS", () => {
  const ics = buildIcs([{ symbol: "AAPL", name: "Apple, Inc.", date: "2026-11-02", session: "amc", quarter: 4, year: 2026, epsE: 2.0221, url: "https://mutaafaziz.com/metaphases/t/AAPL" }], new Date("2026-10-31T12:00:00Z"));
  it("uses CRLF line endings throughout", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("has stable UIDs and all-day dates", () => {
    expect(ics).toContain("UID:AAPL-2026Q4@metaphases");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102");
    expect(ics).toContain("DTEND;VALUE=DATE:20261103");
    expect(ics).toContain("DTSTAMP:20261031T120000Z");
  });
  it("escapes commas and folds long lines to ≤ 75 octets", () => {
    expect(ics).toContain("Apple\\, Inc.");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("folding round-trips", () => {
    const long = "DESCRIPTION:" + "é".repeat(80);
    expect(foldLine(long).replace(/\r\n /g, "")).toBe(long);
  });
});

describe("seasonScore", () => {
  const members = new Set(["A", "B", "C"]);
  const evs = [ev({ s: "A", d: "2026-10-20", eA: 1.2, rA: 110 }), ev({ s: "B", d: "2026-10-21", eA: 0.8, rA: 90 }), ev({ s: "C", d: "2026-11-20" }), ev({ s: "Z", d: "2026-10-22", eA: 2 })];
  it("aggregates only members inside the window", () => {
    const s = seasonScore(evs, (x) => members.has(x), 3, "2026-10-01", "2026-10-31");
    expect(s.reported).toBe(2);
    expect(s.reportedPct).toBe(67);
    expect(s.epsBeatPct).toBe(50);
    expect(s.revBeatPct).toBe(50);
    expect(s.enough).toBe(false);
  });
});

describe("cardSvg", () => {
  it("renders the key facts and escapes text", () => {
    const svg = cardSvg({ symbol: "AT&T", name: "Big <Corp>", when: "Tue, Nov 17", session: "amc", move: 4.8, beats: 4, total: 4, epsE: 2.53 });
    expect(svg).toContain("AT&amp;T");
    expect(svg).toContain("Big &lt;Corp&gt;");
    expect(svg).toContain("Reports Tue, Nov 17, after the close");
    expect(svg).toContain("±4.8%");
    expect(svg).toContain("4 of 4");
    expect(svg).toContain('width="1200" height="630"');
  });
  it("degrades without a date", () => expect(cardSvg({ symbol: "X", name: "X", when: null, session: "", move: null, beats: null, total: null, epsE: null })).toContain("No report date yet"));
});
