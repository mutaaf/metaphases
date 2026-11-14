import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0069: Abercrombie & Fitch (GlobeNewswire, Oct 30: results "shortly after 7:30 a.m. ET" on Tue Nov 24), Dick's
// (PR Newswire, Nov 2: "before the market opens on Tuesday, November 24th") and Burlington (GlobeNewswire, Nov 10:
// "before the U.S. stock market opens on Tuesday, November 24, 2026") all announced Tue Nov 24 before the open.
// Finnhub projects all three on Mon Nov 23 with no session and labels the quarter Q3 2027. Nasdaq agrees with the
// companies (Nov 24, pre-market).

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-14";
const feed = [
  { symbol: "ANF", date: "2026-11-23", hour: "", quarter: 3, year: 2027, epsEstimate: 3.1287, epsActual: null, revenueEstimate: 1380786150, revenueActual: null },
  { symbol: "DKS", date: "2026-11-23", hour: "", quarter: 3, year: 2027, epsEstimate: 1.4178, epsActual: null, revenueEstimate: 5133769571, revenueActual: null },
  { symbol: "BURL", date: "2026-11-23", hour: "", quarter: 3, year: 2027, epsEstimate: 1.7641, epsActual: null, revenueEstimate: 3044520990, revenueActual: null },
];
const SYMS = ["ANF", "DKS", "BURL"] as const;

describe("0069 ANF, DKS and BURL on their announced date", () => {
  for (const s of SYMS) {
    it(`${s}: the entry passes the gate, Tue Nov 24 before the open`, () => {
      expect(FILE[s]).toMatchObject({ date: "2026-11-24", hour: "bmo", quarter: 3, year: 2027 });
      expect(validateOverrides({ [s]: FILE[s] }, today)).toEqual([]);
    });

    it(`${s}: Finnhub's Mon Nov 23 row becomes Tue Nov 24 before the open, estimates kept`, () => {
      const row = feed.find((r) => r.symbol === s)!;
      const out = applyToRows(s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: "2026-11-24", hour: "bmo", epsEstimate: row.epsEstimate })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: 3, year: 2027, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      const title = tickerShareTitle(s, s, next, undefined);
      expect(title).toMatch(/Nov 24/);
      expect(title).not.toMatch(/not yet confirmed/);
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

describe("0069 the companies' date through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
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

  it("/api/calendar has all three on Tue Nov 24 before the open, none on Mon Nov 23", async () => {
    const r = await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    for (const s of SYMS) {
      const rows = r.events.filter((e: any) => e.s === s);
      expect(rows, s).toHaveLength(1);
      expect(rows[0]).toMatchObject({ d: "2026-11-24", h: "bmo", o: FILE[s]?.source });
      expect(rows[0].c).toBeUndefined();
    }
  });

  for (const s of SYMS) {
    it(`/api/ticker/${s}: next is Nov 24 before the open, confirmed, not projected`, async () => {
      const r = await get(`/api/ticker/${s}`);
      expect(r.next).toMatchObject({ date: "2026-11-24", session: "bmo", confirmed: FILE[s]?.source });
      expect(r.next.projected).toBeUndefined();
    });
  }
});
