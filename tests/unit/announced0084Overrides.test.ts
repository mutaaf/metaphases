import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0084: Bath & Body Works (Nov 5: "before market open on Thursday, November 19, 2026", call 8:30 a.m. ET) states
// its session. Helmerich & Payne (Oct 14) names only its call, 10 a.m. ET Thursday, November 19, so the day is
// confirmed and no session is set. Finnhub's feed: BBWI Wed Nov 18 with no time; HP Thu Nov 19 after the close,
// which can't be true when the company discusses the results at 10 a.m. that morning.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-18";
const feed = [
  { symbol: "BBWI", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 0.1213, epsActual: null, revenueEstimate: 1581967398, revenueActual: null },
  { symbol: "HP", date: "2026-11-19", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.2755, epsActual: null, revenueEstimate: 1105702188, revenueActual: null },
];
const WANT: Record<string, { date: string; hour: string; quarter: number; year: number }> = {
  BBWI: { date: "2026-11-19", hour: "bmo", quarter: 3, year: 2027 },
  HP: { date: "2026-11-19", hour: "", quarter: 4, year: 2026 },
};
const SYMS = Object.keys(WANT);
const SOURCE: Record<string, string> = {
  BBWI: "https://finviz.com/news/416976/bath-body-works-to-report-third-quarter-results-on-november-19-2026",
  HP: "https://s25.q4cdn.com/694655835/files/doc_news/Helmerich--Payne-Inc--Schedules-Fiscal-Fourth-Quarter-2026-and-Year-End-Conference-Call-and-Webcast-2026.pdf",
};

describe("0084 BBWI and HP on their announced date", () => {
  for (const s of SYMS) {
    it(`${s}: the entry passes the gate, ${WANT[s].date} ${WANT[s].hour || "(no session)"}`, () => {
      const { hour, ...rest } = WANT[s];
      expect(FILE[s]).toMatchObject({ ...rest, source: SOURCE[s] });
      expect(FILE[s].hour ?? "").toBe(hour);
      expect(validateOverrides({ [s]: FILE[s] }, today)).toEqual([]);
    });
  }

  it("BBWI leaves the feed's day, Nov 18", () => {
    const ev = applyToEvents(feed.map((r) => ({ s: r.symbol, d: r.date, h: r.hour, q: r.quarter, y: r.year, eE: r.epsEstimate, eA: null, rE: r.revenueEstimate, rA: null, t: 1 })), FILE, "2026-11-18", "2026-11-18", today);
    expect(ev.filter((e) => e.s === "BBWI")).toEqual([]);
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

describe("0084 the companies' dates through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    // Nov 18, 10 am ET: BBWI's feed day is today.
    vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
    const cache = new MemCache();
    // Nasdaq's day calendars: BBWI Nov 19 pre-market (agrees), HP Nov 18 after hours (the company's day wins).
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-18")}`, JSON.stringify({ HP: "amc" }));
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-19")}`, JSON.stringify({ BBWI: "bmo" }));
    (globalThis as any).caches = { default: cache };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = feed.filter((r) => sym ? r.symbol === sym && r.date >= today : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const [from, to] of [["2026-11-16", "2026-11-20"], ["2026-11-18", "2026-11-18"], ["2026-11-19", "2026-11-19"], ["2026-11-18", "2026-12-04"]]) {
    it(`/api/calendar ${from}..${to}: each row sits on the company's day with its session, nowhere else`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const s of SYMS) {
        const rows = r.events.filter((e: any) => e.s === s);
        const inRange = WANT[s].date >= from && WANT[s].date <= to;
        expect(rows, s).toHaveLength(inRange ? 1 : 0);
        if (!inRange) continue;
        expect(rows[0]).toMatchObject({ d: WANT[s].date, h: WANT[s].hour, o: SOURCE[s], eA: null, rA: null });
        expect(rows[0].x).toBeUndefined();
        expect(rows[0].c).toBeUndefined();
      }
    });
  }

  for (const s of SYMS) {
    it(`/api/ticker/${s}: next is the company's date and session, confirmed, no contest`, async () => {
      const r = await get(`/api/ticker/${s}`);
      expect(r.next).toMatchObject({ date: WANT[s].date, session: WANT[s].hour, confirmed: SOURCE[s] });
      expect(r.next.session).not.toBe("amc");
      expect(r.next.projected).toBeUndefined();
      expect(r.next.nasdaq).toBeUndefined();
      expect(r.next.status).toBeUndefined();
    });
  }

  it("the /t/ share titles state the company's day, never \"unconfirmed\", \"results expected\" or \"after the close\"", async () => {
    const title = async (s: string) => { const r = await get(`/api/ticker/${s}`); return tickerShareTitle(s, s, r.next, r.justReported); };
    expect(await title("BBWI")).toBe("BBWI reports Thu, Nov 19 before the open · Metaphases");
    const hp = await title("HP");
    expect(hp).toMatch(/^HP reports Thu, Nov 19/);
    expect(hp).not.toMatch(/unconfirmed|results expected|after/i);
  });
});
