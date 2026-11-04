import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

// 0013 end to end through the worker: data/date-overrides.json moves ARM to Arm's own date
// (Wed Nov 4 after the close) on /api/calendar and /api/ticker, which share meta reads.

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const armRow = { symbol: "ARM", date: "2026-11-05", hour: "", quarter: 2, year: 2027, epsEstimate: 0.4795, epsActual: null, revenueEstimate: 1389460423, revenueActual: null };

beforeEach(() => {
  pending = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [armRow, { ...armRow, symbol: "MSFT", hour: "amc" }] }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("company date overrides in the worker", () => {
  it("/api/calendar lists ARM on Nov 4 after the close, not Nov 5", async () => {
    const r = await get("/api/calendar?from=2026-11-02&to=2026-11-06");
    const arm = r.events.filter((e: any) => e.s === "ARM");
    expect(arm).toHaveLength(1);
    expect(arm[0]).toMatchObject({ d: "2026-11-04", h: "amc", eE: 0.4795 });
    expect(arm[0].o).toMatch(/^https:\/\/newsroom\.arm\.com\//);
    expect(r.events.find((e: any) => e.s === "MSFT")?.d).toBe("2026-11-05");
  });

  it("/api/ticker/ARM gives Nov 4 after the close as the next report, with the company's source", async () => {
    const r = await get("/api/ticker/ARM");
    expect(r.next).toMatchObject({ date: "2026-11-04", session: "amc", quarter: 2, year: 2027, epsE: 0.4795 });
    expect(r.next.confirmed).toMatch(/^https:\/\/newsroom\.arm\.com\//);
    expect(r.read[0]).toContain("Wednesday, Nov 4 after the close");
  });
});

// 0013 bounce 1 (critic 2026-11-04 07:00): WES and PAA, rows as Finnhub served them live that morning.
// The calendar's Q3 rows sit on past days (Nov 2, Nov 3) and `symbol=` returns only the February quarter,
// so without an override the sheet skipped straight to February.
describe("company date overrides: WES and PAA (AXON case, Finnhub's Q3 row already in the past)", () => {
  const wesQ3 = { symbol: "WES", date: "2026-11-02", hour: "amc", quarter: 3, year: 2026, epsEstimate: 0.9179, epsActual: null, revenueEstimate: 1223424312, revenueActual: null };
  const paaQ3 = { symbol: "PAA", date: "2026-11-03", hour: "", quarter: 3, year: 2026, epsEstimate: 0.4157, epsActual: null, revenueEstimate: 15359726500, revenueActual: null };
  const wesQ4 = { ...wesQ3, date: "2027-02-16", quarter: 4, epsEstimate: 0.9 };
  const paaQ4 = { ...paaQ3, date: "2027-02-04", quarter: 4, epsEstimate: 0.4 };
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (!url.pathname.endsWith("/calendar/earnings")) return new Response("{}", { status: 404 });
      const sym = url.searchParams.get("symbol");
      if (sym === "WES") return new Response(JSON.stringify({ earningsCalendar: [wesQ4] }));
      if (sym === "PAA") return new Response(JSON.stringify({ earningsCalendar: [paaQ4] }));
      return new Response(JSON.stringify({ earningsCalendar: [wesQ3, paaQ3] }));
    }));
  });

  it("/api/calendar moves WES to Wed Nov 4 after the close and PAA to Fri Nov 6 before the open, once each", async () => {
    const r = await get("/api/calendar?from=2026-11-02&to=2026-11-06");
    const wes = r.events.filter((e: any) => e.s === "WES");
    const paa = r.events.filter((e: any) => e.s === "PAA");
    expect(wes).toEqual([expect.objectContaining({ d: "2026-11-04", h: "amc", eE: 0.9179 })]);
    expect(paa).toEqual([expect.objectContaining({ d: "2026-11-06", h: "bmo", eE: 0.4157 })]);
    expect(wes[0].o).toMatch(/^https:\/\//);
    expect(paa[0].o).toMatch(/^https:\/\//);
  });

  it("/api/ticker gives tonight's (WES) and Friday's (PAA) report as next, not February", async () => {
    const wes = await get("/api/ticker/WES");
    expect(wes.next).toMatchObject({ date: "2026-11-04", session: "amc", quarter: 3, year: 2026 });
    expect(wes.next.confirmed).toMatch(/^https:\/\//);
    const paa = await get("/api/ticker/PAA");
    expect(paa.next).toMatchObject({ date: "2026-11-06", session: "bmo", quarter: 3, year: 2026 });
    expect(paa.next.confirmed).toMatch(/^https:\/\//);
    // Known gap (ticket 0038): `symbol=` has no Q3 row to borrow, so the sheet shows no estimate rather than
    // February's. Never Q4's estimate on a Q3 date; when 0038 carries the calendar's estimate over, flip this.
    expect(wes.next.epsE ?? null).not.toBe(0.9);
    expect(paa.next.epsE ?? null).not.toBe(0.4);
  });
});
