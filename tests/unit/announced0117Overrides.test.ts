import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0117: Trip.com and NIO published their Dec 1 report times, but with no override both fell to "Checking time…" on
// every unchecked calendar read (13 of 30 on 2026-11-27), while the five Canadian banks (company-dated) held theirs.
//  TCOM Trip.com, Nov 19 (PR Newswire): Tuesday, December 1, 2026, U.S. Time, "after the market closes", call 7:00 PM ET
//  NIO  NIO, Nov 17 (GlobeNewswire): Tuesday, December 1, 2026, "before the open of the U.S. markets", call 7:00 AM ET
// Sweep of the other $5B+ Dec 1–4 rows with no link (read 2026-11-28): ZS, KR, GTLB, BF.B: no company notice found.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-28";
const CASES = [
  { s: "TCOM", date: "2026-12-01", h: "amc", q: 3, y: 2026, call: "7:00 p.m. ET", feedH: "", title: "TCOM reports Tue, Dec 1 after the close · Metaphases" },
  { s: "NIO", date: "2026-12-01", h: "bmo", q: 3, y: 2026, call: "7:00 a.m. ET", feedH: "", title: "NIO reports Tue, Dec 1 before the open · Metaphases" },
] as const;
// Finnhub's rows with the hour blank, as an unchecked read showed them on 2026-11-27 (only the override can set it).
const feed = CASES.map((c, i) => ({ symbol: c.s, date: c.date, hour: c.feedH, quarter: c.q, year: c.y, epsEstimate: 1 + i / 10, epsActual: null, revenueEstimate: 1e9 + i, revenueActual: null }));

describe("0117 company-announced dates and sessions", () => {
  for (const c of CASES) {
    it(`${c.s}: the entry passes the gate, ${c.date} ${c.h}, call ${c.call}`, () => {
      expect(FILE[c.s]).toMatchObject({ date: c.date, hour: c.h, quarter: c.q, year: c.y, call: c.call });
      expect(FILE[c.s].source).toMatch(/^https:\/\//);
      expect(validateOverrides({ [c.s]: FILE[c.s] }, today)).toEqual([]);
    });

    it(`${c.s}: the feed's row takes the company's session; the share title is firm`, () => {
      const row = feed.find((r) => r.symbol === c.s)!;
      const out = applyToRows(c.s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: c.date, hour: c.h, epsEstimate: row.epsEstimate })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: c.q, year: c.y, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      expect(tickerShareTitle(c.s, c.s, next, undefined)).toBe(c.title);
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

describe("0117 through the worker, with Nasdaq unread (the unchecked first read)", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T07:00:00Z"));
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

  for (const range of [["2026-11-30", "2026-12-04"], ["2026-12-01", "2026-12-01"], ["2026-11-27", "2026-12-06"]]) {
    it(`/api/calendar ${range[0]}..${range[1]}: each company's session and link, never held as unchecked`, async () => {
      const r = await get(`/api/calendar?from=${range[0]}&to=${range[1]}`);
      for (const c of CASES) {
        const rows = r.events.filter((e: any) => e.s === c.s);
        expect(rows, c.s).toHaveLength(1);
        expect(rows[0]).toMatchObject({ d: c.date, h: c.h, o: FILE[c.s]?.source });
        expect(rows[0].hu, c.s).toBeUndefined();
        expect(rows[0].x, c.s).toBeUndefined();
      }
    });
  }

  for (const c of CASES) {
    it(`/api/ticker/${c.s}: next is the company's date and session, confirmed, with its call`, async () => {
      const r = await get(`/api/ticker/${c.s}`);
      expect(r.next).toMatchObject({ date: c.date, session: c.h, confirmed: FILE[c.s]?.source, call: c.call });
      expect(r.next.projected).toBeUndefined();
      expect(r.next.unchecked).toBeUndefined();
    });
  }
});
