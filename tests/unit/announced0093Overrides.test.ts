import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0093: Macy's (Business Wire, Nov 17): "will report its third quarter 2026 sales and earnings results on
// Wednesday, December 2", call 8:00 a.m. ET. The notice names no release time, so the day is confirmed and no
// session is set (a call time alone isn't a session: INTU, DE, HP). Finnhub's feed: Thu Dec 3, time blank;
// Nasdaq: Dec 2 pre-market, so the row read "two calendars disagree… until the company announces it".

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-20";
const SOURCE = "https://finviz.com/news/423868/macys-inc-to-report-third-quarter-2026-results-on-december-2-2026";
const feed = [
  { symbol: "M", date: "2026-12-03", hour: "", quarter: 3, year: 2027, epsEstimate: -0.179, epsActual: null, revenueEstimate: 4773724950, revenueActual: null },
];

describe("0093 Macy's on its announced date", () => {
  it("the entry passes the gate: Dec 2, no session, the call time from the notice", () => {
    expect(FILE.M).toMatchObject({ date: "2026-12-02", quarter: 3, year: 2027, source: SOURCE, call: "8 a.m. ET" });
    expect(FILE.M.hour ?? "").toBe("");
    expect(validateOverrides({ M: FILE.M }, today)).toEqual([]);
  });

  it("M leaves the feed's day, Dec 3", () => {
    const ev = applyToEvents(feed.map((r) => ({ s: r.symbol, d: r.date, h: r.hour, q: r.quarter, y: r.year, eE: r.epsEstimate, eA: null, rE: r.revenueEstimate, rA: null, t: 0 })), FILE, "2026-12-03", "2026-12-03", today);
    expect(ev.filter((e) => e.s === "M")).toEqual([]);
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

describe("0093 Macy's date through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
    const cache = new MemCache();
    // Nasdaq's day calendar: Dec 2 pre-market (agrees with the company's day).
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-12-02")}`, JSON.stringify({ M: "bmo" }));
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

  for (const [from, to] of [["2026-11-30", "2026-12-04"], ["2026-12-02", "2026-12-02"], ["2026-12-03", "2026-12-03"], ["2026-11-20", "2026-12-03"]]) {
    it(`/api/calendar ${from}..${to}: M sits on Dec 2 only, confirmed, uncontested`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      const rows = r.events.filter((e: any) => e.s === "M");
      const inRange = "2026-12-02" >= from && "2026-12-02" <= to;
      expect(rows).toHaveLength(inRange ? 1 : 0);
      if (!inRange) return;
      expect(rows[0]).toMatchObject({ d: "2026-12-02", h: "", o: SOURCE, eA: null, rA: null });
      expect(rows[0].x).toBeUndefined();
    });
  }

  it("/api/ticker/M: next is the company's day, confirmed, with its call time and no contest", async () => {
    const r = await get("/api/ticker/M");
    expect(r.next).toMatchObject({ date: "2026-12-02", session: "", confirmed: SOURCE });
    expect(r.next.projected).toBeUndefined();
    expect(r.next.nasdaq).toBeUndefined();
    expect(r.next.status).toBeUndefined();
    expect(JSON.stringify(r.next)).toContain("8 a.m. ET");
  });

  it("the /t/M share title states Wed, Dec 2, never \"unconfirmed\"", async () => {
    const r = await get("/api/ticker/M");
    const title = tickerShareTitle("M", "Macy's", r.next, r.justReported);
    expect(title).toMatch(/^M reports Wed, Dec 2/);
    expect(title).not.toMatch(/unconfirmed|Dec 3|after/i);
  });
});
