import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays } from "../../shared/crossCheck";
import { passedQuarter, tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0078 bounce 1 (critic 2026-11-17 07:00): the day after PDD's feed day (Mon Nov 16), Finnhub's `symbol=` had no
// future row at all, so the sheet had no `next` to find the skipped quarter from: `/api/ticker/PDD` gave
// `next: null` two days before Nasdaq's Thu Nov 19. The feed's passed row must stay the next report, with
// Nasdaq's day named, until Nasdaq's day passes. Made-up symbol, so no live date override can win.

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const SYM = "QQPD";
const feedDay = { s: SYM, d: "2026-11-16", h: "bmo", q: 3, y: 2026, eE: 19.213, eA: null, rE: 117133197205, rA: null, t: 1 };
const history = [
  { fiscalQtrEnd: "Jun 2026", dateReported: "8/24/2026", eps: 3.1, consensusForecast: "2.9", percentageSurprise: "6.9" },
  { fiscalQtrEnd: "Mar 2026", dateReported: "5/27/2026", eps: 2.5, consensusForecast: "2.7", percentageSurprise: "-7.4" },
  { fiscalQtrEnd: "Dec 2025", dateReported: "3/25/2026", eps: 3.0, consensusForecast: "2.8", percentageSurprise: "7.1" },
];
let upcoming: any[] = [];
let cache: MemCache;

beforeEach(() => {
  waits = []; upcoming = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T19:00:00Z")); // Tue, the trading day after the feed's Mon Nov 16
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: history } } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: url.searchParams.get("symbol") === SYM ? upcoming : [] }));
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 200 });
  }));
  cache.store.set(CAL("cal:v3:2026-11-16"), JSON.stringify([feedDay]));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async () => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${SYM}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
/** Nasdaq's window as the calendar caches it, listing the company on `on` (pre-market). */
const nasdaqLists = (on: string | null, today = "2026-11-17") => {
  for (const d of windowDays(today)) cache.store.set(CAL(`nq:x:v1:${d}`), JSON.stringify(d === on ? { [SYM]: "bmo" } : { FILLER: "" }));
};

describe("0078: the day after a contested feed day, with no future feed row", () => {
  it("next keeps the feed's date with Nasdaq's day, not null and not 'results expected'", async () => {
    nasdaqLists("2026-11-19");
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", quarter: 3, year: 2026, epsE: 19.213, nasdaq: { date: "2026-11-19", session: "bmo" } });
    expect(t.next.status).toBeUndefined();
    expect(t.next.overdue).toBeUndefined();
    expect(t.justReported ?? null).toBeNull();
    expect(tickerShareTitle(SYM, "Qqpd Holdings", t.next)).toBe("QQPD reports Mon, Nov 16 (unconfirmed; Nasdaq lists Thu, Nov 19) · Metaphases");
    expect(t.read.join(" ")).toMatch(/Nasdaq's calendar lists Thursday, Nov 19/);
  });

  it("the same with a far-off next quarter in the feed (the existing skipped-quarter path)", async () => {
    upcoming = [{ symbol: SYM, date: "2027-03-18", hour: "bmo", quarter: 4, year: 2026, epsEstimate: 20, epsActual: null, revenueEstimate: 1.2e11, revenueActual: null }];
    nasdaqLists("2026-11-19");
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", quarter: 3, nasdaq: { date: "2026-11-19", session: "bmo" } });
  });

  it("two trading days on, Nasdaq listing nothing: the passed quarter is overdue, not dropped", async () => {
    vi.setSystemTime(new Date("2026-11-18T19:00:00Z"));
    nasdaqLists(null, "2026-11-18");
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", quarter: 3, overdue: true });
    expect(t.next.nasdaq).toBeUndefined();
  });

  it("a row the company already reported (Nasdaq history has it) isn't revived", async () => {
    history.unshift({ fiscalQtrEnd: "Sep 2026", dateReported: "11/16/2026", eps: 3.3, consensusForecast: "3.1", percentageSurprise: "6.5" });
    try {
      nasdaqLists(null);
      const t = await sheet();
      expect(t.next?.date).not.toBe("2026-11-16");
      expect(t.next?.overdue).toBeUndefined();
    } finally { history.shift(); }
  });
});

describe("0078 self-review: the no-future-row path's other outcomes", () => {
  it("a passed row with figures in is the report it was: just reported, not overdue", async () => {
    cache.store.set(CAL("cal:v3:2026-11-16"), JSON.stringify([{ ...feedDay, eA: 20.1, rA: 118e9 }]));
    nasdaqLists(null);
    const t = await sheet();
    expect(t.justReported).toMatchObject({ date: "2026-11-16", quarter: 3 });
    expect(t.next?.overdue).toBeUndefined();
  });

  it("an unreadable calendar day cache leaves the sheet as it was, never a 500", async () => {
    const real = cache.match.bind(cache);
    cache.match = async (req: Request) => { if (/cal(%3A|:)(stale(%3A|:))?v3/.test(req.url)) throw new Error("cache down"); return real(req); };
    const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${SYM}`), env, ctx);
    await Promise.all(waits); waits = [];
    expect(r.status).toBe(200);
    expect((await r.json() as any).next ?? null).toBeNull();
  });
});

describe("passedQuarter (0078)", () => {
  const rep = ["2026-08-24", "2026-05-27", "2026-03-25"];
  it("a row after the newest report is the quarter still to come", () => {
    expect(passedQuarter(feedDay, rep)).toEqual({ quarter: 3, year: 2026 });
  });
  it("not the report Nasdaq already has, not a company-dated row, not an odd cadence, not without a row", () => {
    expect(passedQuarter({ ...feedDay, d: "2026-08-25" }, rep)).toBeNull();
    expect(passedQuarter({ ...feedDay, o: "https://example.com" }, rep)).toBeNull();
    expect(passedQuarter(feedDay, ["2026-08-24", "2026-02-20"])).toBeNull(); // semiannual
    expect(passedQuarter(feedDay, ["2026-08-24"])).toBeNull();
    expect(passedQuarter(null, rep)).toBeNull();
  });
});
