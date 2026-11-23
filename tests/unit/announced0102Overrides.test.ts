import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0102: Hormel (PR Newswire, Nov 3): "will issue its earnings release before the markets open on Thursday, Dec. 3,
// 2026". Finnhub's feed: Dec 3 after the close, so the row, sheet and unfurl said "after close" against the company,
// Nasdaq (pre-market) and four straight before-open reports. CooperCompanies (GlobeNewswire, Nov 5): results
// "Thursday, December 3, 2026, at 4:15 PM ET". Finnhub's feed: Wed Dec 2 after the close; Nasdaq: Dec 3 after hours.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-23";
const HRL_SRC = "https://s204.q4cdn.com/636391999/files/doc_news/Hormel-Foods-Corporation-Announces-Fourth-Quarter-Earnings-Call-2026.pdf";
const COO_SRC = "https://www.biopharmawatch.com/news/COO/coopercompanies-release-date-fourth-quarter-full-year-2026";
const feed = [
  { symbol: "HRL", date: "2026-12-03", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.376, epsActual: null, revenueEstimate: 3170616815, revenueActual: null },
  { symbol: "COO", date: "2026-12-02", hour: "amc", quarter: 4, year: 2026, epsEstimate: 1.0797, epsActual: null, revenueEstimate: 1078919996, revenueActual: null },
];
const asEvents = () => feed.map((r) => ({ s: r.symbol, d: r.date, h: r.hour as any, q: r.quarter, y: r.year, eE: r.epsEstimate, eA: null, rE: r.revenueEstimate, rA: null, t: 1 }));

describe("0102 Hormel and Cooper on their announced dates and sessions", () => {
  it("the entries pass the gate: HRL Dec 3 before the open, COO Dec 3 after the close", () => {
    expect(FILE.HRL).toMatchObject({ date: "2026-12-03", hour: "bmo", quarter: 4, year: 2026, source: HRL_SRC });
    expect(FILE.COO).toMatchObject({ date: "2026-12-03", hour: "amc", quarter: 4, year: 2026, source: COO_SRC });
    expect(validateOverrides({ HRL: FILE.HRL, COO: FILE.COO }, today)).toEqual([]);
  });

  it("HRL keeps Dec 3 at the company's session; COO leaves the feed's Dec 2", () => {
    const dec3 = applyToEvents(asEvents(), FILE, "2026-12-03", "2026-12-03", today);
    expect(dec3.find((e) => e.s === "HRL")).toMatchObject({ d: "2026-12-03", h: "bmo", o: HRL_SRC });
    const dec2 = applyToEvents(asEvents(), FILE, "2026-12-02", "2026-12-02", today);
    expect(dec2.filter((e) => e.s === "COO")).toEqual([]);
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

describe("0102 Hormel and Cooper through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
    const cache = new MemCache();
    // Nasdaq's day calendars: Dec 3 HRL pre-market and COO after hours (both agree with the companies).
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-12-03")}`, JSON.stringify({ HRL: "bmo", COO: "amc" }));
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-12-02")}`, JSON.stringify({}));
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

  for (const [from, to] of [["2026-11-30", "2026-12-04"], ["2026-12-02", "2026-12-02"], ["2026-12-03", "2026-12-03"], ["2026-11-23", "2026-12-03"]]) {
    it(`/api/calendar ${from}..${to}: HRL before the open and COO after the close, both on Dec 3, confirmed, uncontested`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      const inRange = "2026-12-03" >= from && "2026-12-03" <= to;
      const hrl = r.events.filter((e: any) => e.s === "HRL"), coo = r.events.filter((e: any) => e.s === "COO");
      expect(coo.filter((e: any) => e.d === "2026-12-02")).toEqual([]);
      expect(hrl).toHaveLength(inRange ? 1 : 0);
      expect(coo).toHaveLength(inRange ? 1 : 0);
      if (!inRange) return;
      expect(hrl[0]).toMatchObject({ d: "2026-12-03", h: "bmo", o: HRL_SRC });
      expect(coo[0]).toMatchObject({ d: "2026-12-03", h: "amc", o: COO_SRC });
      expect(hrl[0].x).toBeUndefined();
      expect(coo[0].x).toBeUndefined();
    });
  }

  it("/api/ticker/HRL: next is Dec 3 before the open, confirmed, with no Nasdaq disagreement", async () => {
    const r = await get("/api/ticker/HRL");
    expect(r.next).toMatchObject({ date: "2026-12-03", session: "bmo", confirmed: HRL_SRC });
    expect(r.next.nasdaq).toBeUndefined();
    expect(r.next.projected).toBeUndefined();
    expect(r.moveSession).toBeUndefined();
    expect(r.read.join(" ")).not.toMatch(/after the close|disagree/i);
  });

  it("/api/ticker/COO: next is Thu Dec 3 after the close, confirmed", async () => {
    const r = await get("/api/ticker/COO");
    expect(r.next).toMatchObject({ date: "2026-12-03", session: "amc", confirmed: COO_SRC });
    expect(r.next.nasdaq).toBeUndefined();
  });

  it("share titles: HRL before the open, COO Thu, Dec 3 with no \"unconfirmed\"", async () => {
    const h = await get("/api/ticker/HRL");
    const ht = tickerShareTitle("HRL", "Hormel Foods", h.next, h.justReported);
    expect(ht).toMatch(/^HRL reports Thu, Dec 3 before the open/);
    const c = await get("/api/ticker/COO");
    const ct = tickerShareTitle("COO", "The Cooper Companies", c.next, c.justReported);
    expect(ct).toMatch(/^COO reports Thu, Dec 3/);
    expect(ct).not.toMatch(/unconfirmed|Dec 2/i);
  });
});
