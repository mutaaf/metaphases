import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0068: Dollar Tree's 8-K of Nov 3 (Ex. 99.1) says it will report Q3 fiscal 2026 results "before the stock market
// opens on Tuesday, November 24, 2026", call 8 a.m. ET. Finnhub projects Tue Dec 1, time unknown, and labels the
// quarter Q3 2027. Nasdaq agrees with the company (Nov 24, pre-market).

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-13";
const feedRow = { symbol: "DLTR", date: "2026-12-01", hour: "", quarter: 3, year: 2027, epsEstimate: 0.9244, epsActual: null, revenueEstimate: 5139241399, revenueActual: null };

describe("0068 DLTR on its announced date", () => {
  it("the entry passes the gate, with the session the 8-K states", () => {
    expect(FILE.DLTR).toMatchObject({ date: "2026-11-24", hour: "bmo", quarter: 3, year: 2027 });
    expect(FILE.DLTR.source).toMatch(/^https:\/\/www\.sec\.gov\//);
    expect(validateOverrides({ DLTR: FILE.DLTR }, today)).toEqual([]);
  });

  it("sheet: Finnhub's Dec 1 row becomes Tue Nov 24 before the open, estimates kept", () => {
    const out = applyToRows("DLTR", [feedRow], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-24", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 0.9244 })]);
    const next = { date: out[0].date, session: out[0].hour, quarter: 3, year: 2027, epsE: 0.9244, revE: null, confirmed: out[0].source };
    expect(tickerShareTitle("DLTR", "Dollar Tree", next, undefined)).toMatch(/Nov 24/);
  });
});

// Through the worker, with a feed that honours from/to the way Finnhub does (the Dec 1 row only shows up in its week).
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

describe("0068 DLTR's company date through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = [feedRow].filter((r) => sym ? r.symbol === sym : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("/api/calendar has DLTR on Tue Nov 24 before the open, from the company", async () => {
    const r = await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    const rows = r.events.filter((e: any) => e.s === "DLTR");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ d: "2026-11-24", h: "bmo", o: FILE.DLTR?.source });
    expect(rows[0].c).toBeUndefined();
  });

  it("/api/calendar has no DLTR row on the feed's Dec 1", async () => {
    const r = await get("/api/calendar?from=2026-11-30&to=2026-12-04");
    expect(r.events.filter((e: any) => e.s === "DLTR")).toEqual([]);
  });

  it("/api/ticker/DLTR: next is Nov 24 before the open, confirmed, not projected", async () => {
    const r = await get("/api/ticker/DLTR");
    expect(r.next).toMatchObject({ date: "2026-11-24", session: "bmo", confirmed: FILE.DLTR?.source });
    expect(r.next.projected).toBeUndefined();
    expect(r.read[0]).toMatch(/Nov(ember)? 24/);
  });
});
