// 0091: a company-dated report with no announced session (Dell, Autodesk, Marvell) read only "Time TBD", though the
// stock's own past moves already settle when the company usually reports. Now, when they do (3 of the last 4, and
// they agree with the session past moves are measured on), the sheet, the share title and description and The Read
// say "time not announced, usually after the close", marked as a habit. A split keeps "Time TBD". A company-announced
// session always wins. The notice's call time is shown in the company's words, never turned into a session.
// (Scaffold from 0090's unknownNextSession.test.ts.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { usualSession } from "../../shared/reaction";
import { tickerShareTitle } from "../../shared/pending";
import { tickerShareDesc } from "../../shared/reported";
import { validateOverrides } from "../../shared/dateOverrides";

// 0090: whenever the next report's session is unknown (a date-only company notice like Dell's, a blank feed time),
// and `symbol=` has already dropped the last dated report (the day after every print), the past reports' sessions
// came from nothing: every move read "—" and the typical move was null. An unknown next session says nothing about
// when the last four reports came out: the cached last report, Nasdaq, then the stock's own reaction test decide
// (at least 3 of 4), else unknown. The next row's own session stays "".

const REPORTS = ["2026-08-27", "2026-05-28", "2026-02-26", "2025-11-25"]; // newest first, all weekdays
// Dell, 0090's numbers: the day-after (after-close) move wins 4 of 4.
const AMC_DAY = [-6.8, 3.8, -1.6, -1.0], AMC_NEXT = [15.8, 32.8, 21.9, 5.8];
// 2–2 split: no answer.
const SPLIT_DAY = [5, 5, 1, 1], SPLIT_NEXT = [1, 1, 5, 5];

function closes(day: number[], next: number[]) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, bump: number | null = null;
  for (let t = Date.parse("2025-09-01T20:00:00Z"); t <= Date.parse("2026-11-18T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const i = REPORTS.indexOf(iso);
    if (bump != null) { px *= 1 + bump / 100; bump = null; }
    if (i >= 0) { px *= 1 + day[i] / 100; bump = next[i]; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { timestamp, close };
}

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 1.0, consensusForecast: "0.95", percentageSurprise: "5.26" }; });

function stub(sym: string, next: { date: string; hour: string }, chart: { timestamp: number[]; close: number[] }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: chart.timestamp, indicators: { quote: [{ open: chart.close, high: chart.close, low: chart.close, close: chart.close }] } }] } }));
    // symbol= is future-only: the last dated report is gone.
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [{ symbol: sym, date: next.date, hour: next.hour, quarter: 3, year: 2027, epsEstimate: 2.71, epsActual: null, revenueEstimate: 32e9, revenueActual: null }] }));
    return new Response("{}", { status: 404 });
  }));
}
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T16:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const past = (r: any) => r.history.filter((h: any) => REPORTS.includes(h.date));


describe("usualSession (0091)", () => {
  const DATES = REPORTS;
  const closeOf = (day: number[], next: number[]) => { const c = closes(day, next); const ds = c.timestamp.map((t) => new Date(t * 1000).toISOString().slice(0, 10)); return (d: string, off: number) => { const i = ds.indexOf(d); return i < 0 ? null : c.close[i + off] ?? null; }; };
  it("settled after the close (4 of 4), habit unknown or agreeing: amc", () => {
    expect(usualSession("", DATES, closeOf(AMC_DAY, AMC_NEXT))).toBe("amc");
    expect(usualSession("amc", DATES, closeOf(AMC_DAY, AMC_NEXT))).toBe("amc");
  });
  it("a 2–2 split, or moves that contradict the habit past moves use: null (Time TBD)", () => {
    expect(usualSession("amc", DATES, closeOf(SPLIT_DAY, SPLIT_NEXT))).toBeNull();
    expect(usualSession("bmo", DATES, closeOf(AMC_DAY, AMC_NEXT))).toBeNull();
  });
  it("fewer than 3 measured reports: null", () => {
    expect(usualSession("", DATES.slice(0, 2), closeOf(AMC_DAY, AMC_NEXT))).toBeNull();
  });
});

describe("share title and description: announced, habit, unknown (0091)", () => {
  const base = { justReported: undefined, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as any;
  const next = { date: "2026-11-24", session: "", quarter: 3, year: 2027, epsE: 6.71, revE: null, currency: "USD", confirmed: "https://example.com/dell" } as any;
  it("habit: the title and description say the time isn't announced and when it usually is", () => {
    expect(tickerShareTitle("DELL", "Dell", { ...next, usual: "amc" })).toBe("DELL reports Tue, Nov 24, time not announced (usually after the close) · Metaphases");
    const desc = tickerShareDesc("Dell", { ...base, next: { ...next, usual: "amc" } });
    expect(desc).toMatch(/^Dell — Tue, Nov 24, time not announced \(usually after the close, going by its last reports\); Street expects \$6\.71 EPS\./);
    expect(desc).not.toMatch(/Dell — After close|reports after the close/);
  });
  it("unknown: as before, no habit", () => {
    expect(tickerShareTitle("ADSK", "Autodesk", next)).toBe("ADSK reports Tue, Nov 24 · Metaphases");
    expect(tickerShareDesc("Autodesk", { ...base, next })).toMatch(/^Autodesk — Street expects/);
  });
  it("announced: the company's session wins over any habit", () => {
    expect(tickerShareTitle("X", "X", { ...next, session: "bmo", usual: "amc" })).toBe("X reports Tue, Nov 24 before the open · Metaphases");
    expect(tickerShareDesc("X", { ...base, next: { ...next, session: "bmo", usual: "amc" } })).not.toMatch(/usually/);
  });
});

describe("/api/ticker: a company date with no session (0091)", () => {
  // 0108: Dell's and Autodesk's calls come after the close, which settles the session; Deere's 9 a.m. CT (10 a.m. ET)
  // call is in market hours, so it settles nothing, and with Nasdaq not timing it the 0091 habit decides.
  it("DE: usual amc, the notice's call time, and The Read says it's a habit", async () => {
    stub("DE", { date: "2026-11-25", hour: "" }, closes(AMC_DAY, AMC_NEXT));
    const r = await sheet("DE");
    expect(r.next).toMatchObject({ date: "2026-11-25", session: "", usual: "amc", call: "9 a.m. CT" });
    expect(r.read.join(" ")).toMatch(/time not announced; going by its last reports, it usually reports after the close/);
    // The unfurl is built from this same response (shareMeta → tickerShareTitle / tickerShareDesc).
    expect(tickerShareTitle("DE", "Deere", r.next, r.justReported)).toBe("DE reports Wed, Nov 25, time not announced (usually after the close) · Metaphases");
    expect(tickerShareDesc("Deere", r)).toMatch(/^Deere — Wed, Nov 25, time not announced \(usually after the close/);
  });

  it("DE, moves split 2–2: no habit (Time TBD), the call time still shown", async () => {
    stub("DE", { date: "2026-11-25", hour: "" }, closes(SPLIT_DAY, SPLIT_NEXT));
    const r = await sheet("DE");
    expect(r.next.session).toBe("");
    expect(r.next.usual).toBeUndefined();
    expect(r.next.call).toBe("9 a.m. CT");
    expect(r.read.join(" ")).toMatch(/\(time not yet confirmed\)/);
  });

  it("DELL (0108): its 3:30 p.m. CT call settles after the close; never 'time not announced', no habit label", async () => {
    stub("DELL", { date: "2026-11-24", hour: "" }, closes(SPLIT_DAY, SPLIT_NEXT));
    const r = await sheet("DELL");
    expect(r.next).toMatchObject({ date: "2026-11-24", session: "amc", call: "3:30 p.m. CT" });
    expect(r.next.usual).toBeUndefined();
    expect(r.next.hs).toBeUndefined();
    expect(r.read.join(" ")).not.toMatch(/not announced|not yet confirmed/);
    const title = tickerShareTitle("DELL", "Dell Technologies", r.next, r.justReported);
    expect(title).toBe("DELL reports Tue, Nov 24 after the close · Metaphases");
  });

  it("a feed row with its own session: no habit label, whatever the moves say", async () => {
    stub("ZZAN", { date: "2026-11-25", hour: "bmo" }, closes(AMC_DAY, AMC_NEXT));
    const r = await sheet("ZZAN");
    expect(r.next.session).toBe("bmo");
    expect(r.next.usual).toBeUndefined();
    expect(r.next.call).toBeUndefined();
  });
});

describe("validateOverrides: call (0091)", () => {
  const e = (call: unknown) => validateOverrides({ X: { date: "2026-11-24", quarter: 3, year: 2027, source: "https://x.com/a", checked: "2026-11-16", call } }, "2026-11-19");
  it("accepts the notice's time and zone, rejects anything else", () => {
    expect(e("3:30 p.m. CT")).toEqual([]);
    expect(e("9 a.m. CT")).toEqual([]);
    expect(e("after the close")).toHaveLength(1);
    expect(e("15:30 CST")).toHaveLength(1);
  });
});
