import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { isDated, tickerShareTitle } from "../../shared/pending";
import { pendingLine, reportedCard, reportedLine, reportOutcome, sessionPassed, tickerShareDesc } from "../../shared/reported";
import { storyTickerSvg } from "../../shared/story";
import { cardSvg } from "../../shared/depth";

// 0039: once a company has reported, the sheet, The Read and the share card say so the same day.
// PFE-shaped rows under a made-up symbol (no entry in data/date-overrides.json).

describe("reportOutcome", () => {
  const row = { date: "2026-11-03", hour: "bmo", quarter: 3, year: 2026, eE: 0.73, eA: null as number | null, rE: null, rA: null };
  it("figures in: reported, even before the session is over", () => {
    expect(reportOutcome({ ...row, eA: 0.87 }, "2026-11-03", 7 * 60)?.kind).toBe("reported");
    expect(reportOutcome({ ...row, rA: 1e9 }, "2026-11-03", 7 * 60)?.kind).toBe("reported");
  });
  it("today, session over, no figures: results pending; before the session: still upcoming", () => {
    expect(reportOutcome(row, "2026-11-03", 13 * 60)?.kind).toBe("results-pending");
    expect(reportOutcome(row, "2026-11-03", 8 * 60)).toBeNull();
    expect(reportOutcome({ ...row, hour: "amc" }, "2026-11-03", 13 * 60)).toBeNull();
    expect(reportOutcome({ ...row, hour: "" }, "2026-11-03", 23 * 60)).toBeNull(); // unknown session: never assume
  });
  it("an earlier day with no figures is pending; a future day is upcoming", () => {
    expect(reportOutcome(row, "2026-11-04", 0)?.kind).toBe("results-pending");
    expect(reportOutcome({ ...row, date: "2026-11-05", eA: 1 }, "2026-11-04", 0)).toBeNull();
  });
  it("sessionPassed: bmo by 9:30, dmh by 4 pm, amc by 5 pm ET", () => {
    expect(sessionPassed("bmo", 9 * 60 + 29)).toBe(false);
    expect(sessionPassed("bmo", 9 * 60 + 30)).toBe(true);
    expect(sessionPassed("amc", 16 * 60 + 59)).toBe(false);
    expect(sessionPassed("amc", 17 * 60)).toBe(true);
  });
  it("lines are past tense and never say 'expects'", () => {
    const fmt = (v: number) => `$${v.toFixed(2)}`;
    expect(reportedLine("Pfizer Inc.", { date: "2026-11-03", session: "bmo", quarter: 3, epsE: 0.73, epsA: 0.87 }, "2026-11-03", fmt))
      .toBe("Pfizer Inc. reported Q3 today (Tuesday, Nov 3) before the opening bell: $0.87 a share against $0.73 expected, a beat of 19%.");
    expect(reportedLine("X", { date: "2026-11-03", session: "amc", quarter: 3, epsE: 1, epsA: 0.9 }, "2026-11-04", fmt)).toContain("on Tuesday, Nov 3 after the close: $0.90 a share against $1.00 expected, a miss of 10%.");
    expect(pendingLine("Pfizer Inc.", { date: "2026-11-03", session: "bmo", quarter: 3 }, "2026-11-03"))
      .toBe("Pfizer Inc.'s Q3 results were expected before the opening bell today (Tuesday, Nov 3); none are in our data yet.");
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const q3 = { symbol: "ZZZR", date: "2026-11-03", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 0.73, epsActual: null as number | null, revenueEstimate: 16e9, revenueActual: null as number | null };
const q4 = { symbol: "ZZZR", date: "2027-02-02", hour: "bmo", quarter: 4, year: 2026, epsEstimate: 0.6, epsActual: null, revenueEstimate: 17e9, revenueActual: null };
const q3Day = { s: "ZZZR", d: "2026-11-03", h: "bmo", q: 3, y: 2026, eE: 0.73, eA: null as number | null, rE: 16e9, rA: null, t: 1 };
const nasdaqRows = [
  { fiscalQtrEnd: "Jun 2026", dateReported: "8/4/2026", eps: 0.78, consensusForecast: "0.7", percentageSurprise: "11.4" },
  { fiscalQtrEnd: "Mar 2026", dateReported: "5/5/2026", eps: 0.7, consensusForecast: "0.68", percentageSurprise: "2.9" },
];
let symbolRows: any[] = [];
let cache: MemCache;

beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T18:00:00Z")); // 1 pm ET, report day
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  symbolRows = [q3, q4];
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nasdaqRows } } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: symbolRows }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const FUTURE = /\breports Q3\b|expects \$0\.73|be ready for|Into the print/;

describe("/api/ticker on report day (PFE shape, Nov 3, 1 pm ET)", () => {
  it("an actual on today's row: the report heads history and next moves to Q4", async () => {
    symbolRows = [{ ...q3, epsActual: 0.87 }, q4];
    const r = await get("/api/ticker/ZZZR");
    expect(r.next).toMatchObject({ quarter: 4, year: 2026, date: "2027-02-02" });
    expect(r.history[0]).toMatchObject({ date: "2026-11-03", session: "bmo", epsE: 0.73, epsA: 0.87, move: null });
    expect(r.history[0].surprisePct).toBeCloseTo(19.18, 1);
    expect(r.justReported).toMatchObject({ date: "2026-11-03", quarter: 3, epsE: 0.73, epsA: 0.87 });
    expect(r.read[0]).toBe("ZZZR reported Q3 today (Tuesday, Nov 3) before the opening bell: $0.87 a share against $0.73 expected, a beat of 19%.");
    expect(r.read.join(" ")).not.toMatch(FUTURE);
    expect(r.read.join(" ")).toContain("Wall Street expects $0.60 a share, versus $0.87 last quarter."); // the Q4 line compares with the print just out
    const title = tickerShareTitle("ZZZR", "ZZZR", r.next, r.justReported);
    expect(title).not.toContain("reports Tue, Nov 3");
    expect(title).toBe("ZZZR reported Q3: $0.87 a share vs $0.73 expected · Metaphases");
    const desc = tickerShareDesc("ZZZR", r);
    expect(desc).not.toContain("Street expects");
    expect(desc).toContain("Reported Q3 on Tue, Nov 3");
  });

  it("the actual can come from the calendar's cached day when the symbol row lacks it", async () => {
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([{ ...q3Day, eA: 0.87 }]));
    const r = await get("/api/ticker/ZZZR");
    expect(r.next.quarter).toBe(4);
    expect(r.history[0]).toMatchObject({ date: "2026-11-03", epsA: 0.87 });
  });

  it("no actual after the open: results pending, never 'expects'", async () => {
    const r = await get("/api/ticker/ZZZR");
    expect(r.next).toMatchObject({ quarter: 3, date: "2026-11-03", status: "results-pending", epsE: 0.73 });
    expect(r.justReported).toBeUndefined();
    expect(r.read[0]).toContain("results were expected before the opening bell today");
    expect(r.read.join(" ")).not.toMatch(FUTURE);
    expect(r.read.join(" ")).not.toContain("expects");
    expect(r.read.join(" ")).toContain("The estimate going in was $0.73 a share.");
    expect(isDated(r.next)).toBe(false);
    expect(tickerShareTitle("ZZZR", "ZZZR", r.next)).toBe("ZZZR's Q3 results expected: none in yet · Metaphases");
    expect(tickerShareDesc("ZZZR", r)).not.toContain("Street expects");
  });

  it("before the open: still a normal upcoming report", async () => {
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z")); // 7 am ET
    const r = await get("/api/ticker/ZZZR");
    expect(r.next.status).toBeUndefined();
    expect(r.read[0]).toContain("reports Q3 on Tuesday, Nov 3 before the opening bell");
  });
});

describe("/api/ticker the day after (ADM shape, Nov 4): the report never vanishes", () => {
  beforeEach(() => { vi.setSystemTime(new Date("2026-11-04T15:00:00Z")); symbolRows = [q4]; });

  it("figures on the cached day: the report heads history while Nasdaq catches up", async () => {
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([{ ...q3Day, eA: 0.87 }]));
    const r = await get("/api/ticker/ZZZR");
    expect(r.history[0]).toMatchObject({ date: "2026-11-03", epsE: 0.73, epsA: 0.87 });
    expect(r.next.quarter).toBe(4);
    expect(r.read[0]).toContain("reported Q3 on Tuesday, Nov 3");
    expect(r.read.join(" ")).not.toContain("versus $0.78 last quarter");
  });

  it("no figures yet: Q3 stays next as results pending, not Q4 with last quarter's numbers", async () => {
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([q3Day]));
    const r = await get("/api/ticker/ZZZR");
    expect(r.next).toMatchObject({ quarter: 3, date: "2026-11-03", status: "results-pending" });
    expect(r.next.overdue).toBeUndefined();
    expect(r.read[0]).toContain("results were expected before the opening bell on Tuesday, Nov 3");
    expect(r.read.join(" ")).not.toMatch(/Feb|last quarter/);
  });
});

describe("review fixes", () => {
  it("Nasdaq already lists the report a day off (Nov 4): one row, not the quarter counted twice", async () => {
    vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
    symbolRows = [q4];
    const rows = [{ fiscalQtrEnd: "Sep 2026", dateReported: "11/4/2026", eps: 0.87, consensusForecast: "0.73", percentageSurprise: "19.2" }, ...nasdaqRows];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows } } }));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: symbolRows }));
      return new Response("{}", { status: 404 });
    }));
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([{ ...q3Day, eA: 0.87 }]));
    const r = await get("/api/ticker/ZZZR");
    expect(r.history.filter((h: any) => h.epsA === 0.87)).toHaveLength(1);
    expect(r.beatRate.total).toBe(3);
  });

  it("'Just reported' comes down after a few trading days; the history row stays", async () => {
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z")); // 5 trading days after Nov 3
    symbolRows = [q4];
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([{ ...q3Day, eA: 0.87 }]));
    const r = await get("/api/ticker/ZZZR");
    expect(r.justReported).toBeUndefined();
    expect(r.history[0]).toMatchObject({ date: "2026-11-03", epsA: 0.87 });
  });

  it("story and share cards: reported or expected, never 'Wall Street expects' or 'Reports'", () => {
    const pend = reportedCard({ next: { date: "2026-11-03", session: "bmo", quarter: 3, year: 2026, epsE: 1.67, revE: null, currency: "USD", status: "results-pending" } }, "2026-11-03");
    expect(pend).toEqual({ headline: "Q3 results expected, none in yet", stat: { label: "EPS EST GOING IN", value: "$1.67" } });
    expect(reportedCard({ next: null, justReported: { date: "2026-11-03", session: "bmo", quarter: 3, year: 2026, epsE: 0.73, epsA: 0.87, currency: "USD" } }, "2026-11-03")?.headline).toBe("Reported Q3 today");
    const svg = storyTickerSvg({ symbol: "CVS", name: "CVS Health", does: "Pharmacies", when: "x", session: "bmo", epsE: 1.67, move: 3, grade: "B", beats: 3, total: 4, ...pend! });
    expect(svg).not.toContain("WALL STREET EXPECTS");
    expect(svg).not.toContain("Reports x");
  });
});

describe("share card", () => {
  it("says reported, with the actual, instead of 'Reports' and the estimate", () => {
    const svg = cardSvg({ symbol: "PFE", name: "Pfizer", when: null, session: "bmo", move: 3, beats: 4, total: 4, epsE: 0.6, headline: "Reported Q3 today", stat: { label: "EPS ACTUAL", value: "$0.87" } });
    expect(svg).toContain("Reported Q3 today");
    expect(svg).toContain("EPS ACTUAL");
    expect(svg).not.toContain("No report date yet");
  });
});
