import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import worker from "../../worker/index";

// 0082: Williams-Sonoma (Nov 12: "on Thursday, November 19th, 2026 before the market opens") and Copart (Nov 17:
// "before the market opens" on Tuesday, December 1, 2026) state their session. Finnhub's feed: WSM Tue Nov 17
// before the open (so the sheet read "results expected today"), CPRT Wed Nov 18 projected with no time.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-18";
const feed = [
  { symbol: "WSM", date: "2026-11-17", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 2.2063, epsActual: null, revenueEstimate: 2018285353, revenueActual: null },
  { symbol: "CPRT", date: "2026-11-18", hour: "", quarter: 1, year: 2027, epsEstimate: 0.4044, epsActual: null, revenueEstimate: 1213294722, revenueActual: null },
];
const WANT: Record<string, { date: string; hour: string; quarter: number; year: number }> = {
  WSM: { date: "2026-11-19", hour: "bmo", quarter: 3, year: 2027 },
  CPRT: { date: "2026-12-01", hour: "bmo", quarter: 1, year: 2027 },
};
const SYMS = Object.keys(WANT);
const SOURCE: Record<string, string> = {
  WSM: "https://www.stocktitan.net/news/WSM/williams-sonoma-inc-announces-release-date-for-third-quarter-results-mai48begxnh3.html",
  CPRT: "https://finance.yahoo.com/markets/stocks/articles/copart-inc-release-first-quarter-130000894.html",
};

describe("0082 WSM and CPRT on their announced date", () => {
  for (const s of SYMS) {
    it(`${s}: the entry passes the gate, ${WANT[s].date} ${WANT[s].hour}`, () => {
      expect(FILE[s]).toMatchObject({ ...WANT[s], source: SOURCE[s] });
      expect(validateOverrides({ [s]: FILE[s] }, today)).toEqual([]);
    });
  }

  it("the feed's days no longer list either company", () => {
    const ev = applyToEvents(feed.map((r) => ({ s: r.symbol, d: r.date, h: r.hour, q: r.quarter, y: r.year, eE: r.epsEstimate, eA: null, rE: r.revenueEstimate, rA: null, t: 1 })), FILE, "2026-11-16", "2026-11-18", today);
    expect(ev.filter((e) => SYMS.includes(e.s))).toEqual([]);
  });
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

describe("0082 the companies' dates through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    // Nov 17, 8 pm ET: WSM's feed day has passed with no figures; that must not read as a pending report.
    vi.setSystemTime(new Date("2026-11-18T01:00:00Z"));
    const cache = new MemCache();
    // Nasdaq lists CPRT on Nov 19; the company's Dec 1 wins and no contest is shown.
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-19")}`, JSON.stringify({ WSM: "bmo", CPRT: "" }));
    (globalThis as any).caches = { default: cache };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        // symbol= returns future rows only.
        const rows = feed.filter((r) => sym ? r.symbol === sym && r.date >= "2026-11-17" : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const [from, to] of [["2026-11-16", "2026-11-20"], ["2026-11-17", "2026-11-17"], ["2026-11-18", "2026-11-19"], ["2026-11-30", "2026-12-04"], ["2026-11-16", "2026-12-04"]]) {
    it(`/api/calendar ${from}..${to}: each row sits on the company's day with its session, nowhere else`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const s of SYMS) {
        const rows = r.events.filter((e: any) => e.s === s);
        const inRange = WANT[s].date >= from && WANT[s].date <= to;
        expect(rows, s).toHaveLength(inRange ? 1 : 0);
        if (!inRange) continue;
        expect(rows[0]).toMatchObject({ d: WANT[s].date, h: WANT[s].hour, o: SOURCE[s], eA: null, rA: null });
        expect(rows[0].c).toBeUndefined();
      }
    });
  }

  for (const s of SYMS) {
    it(`/api/ticker/${s}: next is the company's date and session, confirmed, not "results pending"`, async () => {
      const r = await get(`/api/ticker/${s}`);
      expect(r.next).toMatchObject({ date: WANT[s].date, session: WANT[s].hour, confirmed: SOURCE[s] });
      expect(r.next.projected).toBeUndefined();
      expect(r.next.nasdaq).toBeUndefined();
      expect(r.next.status).toBeUndefined();
    });
  }
});
