import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

// The calendar used to make one Finnhub call per weekday, so paging a few months ahead tripped the
// free tier's ~60 calls/min and every later month came back empty ("can't go past Feb 2027").
// It now makes at most one range call per week and serves cached days without any call.

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}

const row = (symbol: string, date: string) => ({ symbol, date, hour: "amc", quarter: 1, year: 2027, epsEstimate: 1, epsActual: null, revenueEstimate: 5e9, revenueActual: null });
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
let pending: Promise<unknown>[] = [];
let calls: string[] = [];
let rowsFor: (from: string, to: string) => any[] = () => [];

beforeEach(() => {
  pending = []; calls = [];
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    calls.push(url.search);
    return new Response(JSON.stringify({ earningsCalendar: rowsFor(url.searchParams.get("from")!, url.searchParams.get("to")!) }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const get = async (from: string, to: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/calendar?from=${from}&to=${to}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<{ events: { s: string; d: string }[]; warnings: string[] }>;
};

describe("calendar fetching", () => {
  it("makes one upstream call per week, not per day, and splits rows back into days", async () => {
    rowsFor = (from, to) => [row("AAPL", from), row("MSFT", to)];
    const r = await get("2027-04-26", "2027-05-21"); // four weeks
    expect(calls.length).toBe(4);
    expect(r.warnings).toEqual([]);
    expect(r.events.map((e) => e.d)).toContain("2027-04-26");
    expect(r.events.map((e) => e.d)).toContain("2027-04-30");
  });

  it("serves cached days without calling upstream again", async () => {
    rowsFor = (from) => [row("AAPL", from)];
    await get("2027-03-01", "2027-03-31");
    const first = calls.length;
    const again = await get("2027-03-01", "2027-03-31");
    expect(calls.length).toBe(first);
    expect(again.events.length).toBeGreaterThan(0);
  });

  it("falls back to per-day calls when a range looks truncated", async () => {
    rowsFor = (from, to) => (from === to ? [row("AAPL", from)] : Array.from({ length: 1500 }, (_, i) => row(`X${i}`, from)));
    const r = await get("2027-02-01", "2027-02-05");
    expect(calls.length).toBe(1 + 5);
    expect(new Set(r.events.map((e) => e.d)).size).toBe(5);
  });
});
