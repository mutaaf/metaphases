import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0075: seven companies published their date and session; Finnhub has the right day for each but no session, so
// the sheet and share title called it "not yet confirmed". Company releases (wire copies read 2026-11-15):
//  LI   GlobeNewswire Nov 10: "before the U.S. market opens on Wednesday, November 25, 2026"
//  CRWD Business Wire Nov 4: "after the U.S. market close on Tuesday, December 1, 2026"
//  MDB  PR Newswire Nov 5: "after the U.S. financial markets close on Tuesday, December 1, 2026"
//  NTAP Business Wire Nov 10: "After market close on December 1, 2026"
//  OKTA Business Wire Nov 2: "after the U.S. market close on Tuesday, December 1, 2026"
//  IOT  Business Wire Nov 2: "after the U.S. market closes on Thursday, December 3, 2026"
//  DG   Business Wire Nov 5: results on December 3, call 9:00 a.m. ET (results precede a call before the open)

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-15";
const CASES = [
  { s: "LI", date: "2026-11-25", hour: "bmo", q: 3, y: 2026, title: "LI reports Wed, Nov 25 before the open" },
  { s: "CRWD", date: "2026-12-01", hour: "amc", q: 3, y: 2027, title: "CRWD reports Tue, Dec 1 after the close" },
  { s: "MDB", date: "2026-12-01", hour: "amc", q: 3, y: 2027 },
  { s: "NTAP", date: "2026-12-01", hour: "amc", q: 2, y: 2027 },
  { s: "OKTA", date: "2026-12-01", hour: "amc", q: 3, y: 2027 },
  { s: "IOT", date: "2026-12-03", hour: "amc", q: 3, y: 2027 },
  { s: "DG", date: "2026-12-03", hour: "bmo", q: 3, y: 2027 },
] as const;
// Finnhub's rows as production served them on 2026-11-15: right day, no session.
const feed = CASES.map((c, i) => ({ symbol: c.s, date: c.date, hour: "", quarter: c.q, year: c.y, epsEstimate: 1 + i / 10, epsActual: null, revenueEstimate: 1e9 + i, revenueActual: null }));

describe("0075 announced dates and sessions", () => {
  for (const c of CASES) {
    it(`${c.s}: the entry passes the gate, ${c.date} ${c.hour}`, () => {
      expect(FILE[c.s]).toMatchObject({ date: c.date, hour: c.hour, quarter: c.q, year: c.y });
      expect(validateOverrides({ [c.s]: FILE[c.s] }, today)).toEqual([]);
    });

    it(`${c.s}: the feed's session-less row takes the company's session, estimates kept; the share title is firm`, () => {
      const row = feed.find((r) => r.symbol === c.s)!;
      const out = applyToRows(c.s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: c.date, hour: c.hour, epsEstimate: row.epsEstimate })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: c.q, year: c.y, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      const title = tickerShareTitle(c.s, c.s, next, undefined);
      expect(title).not.toMatch(/not yet confirmed|expected/);
      if ("title" in c) expect(title).toContain(c.title);
    });
  }
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("0075 the companies' sessions through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = feed.filter((r) => sym ? r.symbol === sym : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const range of [["2026-11-16", "2026-12-04"], ["2026-11-23", "2026-12-04"], ["2026-11-30", "2026-12-04"], ["2026-11-23", "2026-12-01"]]) {
    it(`/api/calendar ${range[0]}..${range[1]} carries each company's session and source`, async () => {
      const r = await get(`/api/calendar?from=${range[0]}&to=${range[1]}`);
      for (const c of CASES) {
        if (c.date < range[0] || c.date > range[1]) continue;
        const rows = r.events.filter((e: any) => e.s === c.s);
        expect(rows, c.s).toHaveLength(1);
        expect(rows[0]).toMatchObject({ d: c.date, h: c.hour, o: FILE[c.s]?.source });
        expect(rows[0].hs).toBeUndefined();
      }
    });
  }

  for (const c of CASES) {
    it(`/api/ticker/${c.s}: next is ${c.date} ${c.hour}, confirmed, not projected`, async () => {
      const r = await get(`/api/ticker/${c.s}`);
      expect(r.next).toMatchObject({ date: c.date, session: c.hour, confirmed: FILE[c.s]?.source });
      expect(r.next.projected).toBeUndefined();
    });
  }
});
