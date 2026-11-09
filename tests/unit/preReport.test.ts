import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

// 0035: the calendar judges a print against the estimate before it, not Finnhub's post-print revision.

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
  async delete(req: Request) { return this.store.delete(req.url); }
}

const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
let finnhub: any[] = [];
let nasdaqCalls = 0;
let nasdaqFails = false;
let nasdaqEmpty = false;

beforeEach(() => {
  pending = []; nasdaqCalls = 0; nasdaqFails = false; nasdaqEmpty = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-01T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") {
      nasdaqCalls++;
      if (nasdaqFails) return new Response("no", { status: 503 });
      if (nasdaqEmpty) return new Response(JSON.stringify({ data: null }));
      return new Response(JSON.stringify({ data: { rows: [{ symbol: "V", epsForecast: "$3.43" }, { symbol: "MA", epsForecast: "$5.14" }] } }));
    }
    const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
    return new Response(JSON.stringify({ earningsCalendar: finnhub.filter((r) => r.date >= from && r.date <= to) }));
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (from: string, to: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/calendar?from=${from}&to=${to}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<{ events: any[]; warnings: string[] }>;
};
const row = (symbol: string, date: string, epsEstimate: number, epsActual: number | null, revenueEstimate = 10e9, revenueActual: number | null = null) =>
  ({ symbol, date, hour: "amc", quarter: 3, year: 2026, epsEstimate, epsActual, revenueEstimate, revenueActual });

describe("calendar: pre-report estimates (0035)", () => {
  it("a reported day with no snapshot uses Nasdaq's pre-report EPS consensus: V and MA are beats", async () => {
    finnhub = [row("V", "2026-05-26", 3.5055, 3.48), row("MA", "2026-05-26", 5.3156, 5.31)];
    const r = await get("2026-05-26", "2026-05-26");
    const v = r.events.find((e) => e.s === "V"), ma = r.events.find((e) => e.s === "MA");
    expect(v).toMatchObject({ eE: 3.43, eA: 3.48, pr: "n" });
    expect(ma).toMatchObject({ eE: 5.14, pr: "n" });
    expect(r.warnings).toEqual([]);
    expect(nasdaqCalls).toBe(1);
  });

  it("an estimate recorded before the print wins once the actual arrives", async () => {
    finnhub = [row("V", "2026-06-02", 3.44, null, 10.6e9)];
    await get("2026-06-02", "2026-06-02"); // tomorrow: snapshot taken, no Nasdaq EPS lookup
    const cache = (globalThis as any).caches.default as MemCache;
    // Tomorrow is inside the 0015 date cross-check window, which reads Nasdaq's day calendar on its own;
    // the pre-report EPS lookup (cached as nq:cal) must not have happened.
    expect([...cache.store.keys()].some((k) => k.includes("nq%3Acal"))).toBe(false);
    const crossCheckCalls = nasdaqCalls;
    // The day's list expires; Finnhub now shows the actual and a revised estimate.
    for (const k of [...cache.store.keys()]) if (k.includes("cal%3Av2%3A2026-06-02")) cache.store.delete(k);
    finnhub = [row("V", "2026-06-02", 3.5055, 3.48, 10.75e9, 10.7e9)];
    const r = await get("2026-06-02", "2026-06-02");
    expect(r.events[0]).toMatchObject({ eE: 3.44, rE: 10.6e9, eA: 3.48, pr: "s" });
    expect(nasdaqCalls).toBe(crossCheckCalls); // no new Nasdaq call at all: the snapshot wins, the cross-check is cached
  });

  it("an empty Nasdaq answer isn't cached: the next rebuild asks again", async () => {
    nasdaqEmpty = true;
    finnhub = [row("V", "2026-05-28", 3.5055, 3.48)];
    await get("2026-05-28", "2026-05-28");
    const cache = (globalThis as any).caches.default as MemCache;
    expect([...cache.store.keys()].some((k) => k.includes("nq%3Acal"))).toBe(false);
  });

  it("a Nasdaq failure leaves Finnhub's figures and shows no warning", async () => {
    nasdaqFails = true;
    finnhub = [row("V", "2026-05-27", 3.5055, 3.48)];
    const r = await get("2026-05-27", "2026-05-27");
    expect(r.events[0]).toMatchObject({ eE: 3.5055 });
    expect(r.events[0].pr).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });
});
