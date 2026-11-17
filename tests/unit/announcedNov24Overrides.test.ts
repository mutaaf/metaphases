import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0079: Medtronic (Nov 4: release at 5:45 a.m. CT on Tue Nov 24) and J.M. Smucker (release at 7:00 a.m. ET on Tue
// Nov 24) state a pre-open release. Autodesk (Nov 2: call 2 p.m. PT Tue Nov 24) and Dell (Nov 10: call 3:30 p.m. CST
// Tue Nov 24, results "before the conference call") give the day and a call time only, so the date is the
// company's but no session is set (a call time alone isn't a session: MRVL, ROAD). Finnhub's range rows for all
// four are Nov 24 with a blank session, so the calendar called them projected.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-17";
const feed = [
  { symbol: "MDT", date: "2026-11-24", hour: "", quarter: 2, year: 2027, epsEstimate: 1.3447, epsActual: null, revenueEstimate: 9576144582, revenueActual: null },
  { symbol: "SJM", date: "2026-11-24", hour: "", quarter: 2, year: 2027, epsEstimate: 2.5783, epsActual: null, revenueEstimate: 2288846415, revenueActual: null },
  { symbol: "ADSK", date: "2026-11-24", hour: "", quarter: 3, year: 2027, epsEstimate: 3.1292, epsActual: null, revenueEstimate: 2176492207, revenueActual: null },
  { symbol: "DELL", date: "2026-11-23", hour: "", quarter: 3, year: 2027, epsEstimate: 6.7118, epsActual: null, revenueEstimate: 50193640458, revenueActual: null },
];
const WANT: Record<string, string> = { MDT: "bmo", SJM: "bmo", ADSK: "", DELL: "" };
const SYMS = Object.keys(WANT);
const SOURCE: Record<string, string> = {
  MDT: "https://news.medtronic.com/2026-11-04-Medtronic-to-announce-financial-results-for-its-second-quarter-of-fiscal-year-2027",
  SJM: "https://finviz.com/news/414274/the-jm-smucker-co-to-report-second-quarter-earnings",
  ADSK: "https://finviz.com/news/413095/autodesk-extends-invitation-to-join-financial-results-conference-call",
  DELL: "https://finviz.com/news/420547/dell-technologies-to-hold-conference-call-nov-24-to-discuss-third-quarter-fiscal-2027-financial-results",
};

describe("0079 MDT, SJM, ADSK and DELL on their announced date", () => {
  for (const s of SYMS) {
    it(`${s}: the entry passes the gate, Tue Nov 24${WANT[s] ? " before the open" : ", no session"}`, () => {
      expect(FILE[s]).toMatchObject({ date: "2026-11-24", quarter: feed.find((r) => r.symbol === s)!.quarter, year: 2027 });
      expect(FILE[s]?.hour ?? "").toBe(WANT[s]);
      expect(FILE[s]?.source).toBe(SOURCE[s]);
      expect(validateOverrides({ [s]: FILE[s] }, today)).toEqual([]);
    });

    it(`${s}: Finnhub's row keeps its estimates and takes the company's source`, () => {
      const row = feed.find((r) => r.symbol === s)!;
      const out = applyToRows(s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: "2026-11-24", hour: WANT[s], epsEstimate: row.epsEstimate, source: SOURCE[s] })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: row.quarter, year: 2027, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      const title = tickerShareTitle(s, s, next, undefined);
      expect(title).toMatch(/Nov 24/);
      expect(title).not.toMatch(/not yet confirmed|\(expected\)/);
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

describe("0079 the companies' date through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T15:00:00Z"));
    const cache = new MemCache();
    // Nasdaq's day calendar says after hours for all four. The company's word wins: its bmo for MDT/SJM, and no
    // session at all for ADSK/DELL, whose notices name none (Nasdaq's guess never sits beside "Confirmed").
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-24")}`, JSON.stringify({ MDT: "amc", SJM: "amc", ADSK: "amc", DELL: "amc" }));
    (globalThis as any).caches = { default: cache };
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

  for (const [from, to] of [["2026-11-23", "2026-11-27"], ["2026-11-24", "2026-11-24"], ["2026-11-16", "2026-12-04"]]) {
    it(`/api/calendar ${from}..${to}: each row is the company's, Nov 24, with its session`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const s of SYMS) {
        const rows = r.events.filter((e: any) => e.s === s);
        expect(rows, s).toHaveLength(1);
        expect(rows[0]).toMatchObject({ d: "2026-11-24", h: WANT[s], o: SOURCE[s] });
        expect(rows[0].c).toBeUndefined();
        expect(rows[0].hs).toBeUndefined();
      }
    });
  }

  for (const s of SYMS) {
    it(`/api/ticker/${s}: next is Nov 24, the company's session, confirmed, not projected`, async () => {
      const r = await get(`/api/ticker/${s}`);
      expect(r.next).toMatchObject({ date: "2026-11-24", session: WANT[s], confirmed: SOURCE[s] });
      expect(r.next.projected).toBeUndefined();
      expect(r.next.hs).toBeUndefined();
    });
  }
});
