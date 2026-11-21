import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { epsVerdict, fillMovedFigures } from "../../shared/compare";
import worker from "../../worker/index";

// 0097: a company-dated row whose Finnhub row sat on another day (ROST, GAP, BBWI Nov 18; WSM Nov 17; PDD Nov 16)
// never met the company's day's Nasdaq actuals: the per-day pre-report step ran on the feed's day, before the
// override moved the row. So Ross read "EPS est $1.91 · Figures pending" two days after it reported $1.91 against
// a $1.85 consensus, and the $1.91 "estimate" was Finnhub's revision after the print (the 2026-11-19 TJX trap).

const feed = [
  // Feed estimates as Finnhub revised them after the print (ROST's equals the actual).
  { symbol: "ROST", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 1.9138, epsActual: null, revenueEstimate: 6402829863, revenueActual: null },
  { symbol: "WSM", date: "2026-11-17", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 2.2063, epsActual: null, revenueEstimate: 2018285353, revenueActual: null },
  { symbol: "GAP", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 0.7855, epsActual: null, revenueEstimate: 4056477675, revenueActual: null },
  { symbol: "BBWI", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 0.1213, epsActual: null, revenueEstimate: 1581967398, revenueActual: null },
  // Estimates in yuan per share: Nasdaq's dollars-per-ADR pair can't replace them.
  { symbol: "PDD", date: "2026-11-16", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 19.213, epsActual: null, revenueEstimate: 117133197205, revenueActual: null },
  // Feed row already on the company's day, judged on its snapshot: untouched.
  { symbol: "WMT", date: "2026-11-19", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 0.6421, epsActual: 0.65, revenueEstimate: 189143823120, revenueActual: 188835000000 },
];
// Nasdaq's day calendar for Nov 19 (live, read 2026-11-21).
const NQ19 = [
  { symbol: "WMT", eps: "$0.65", epsForecast: "$0.64" },
  { symbol: "PDD", eps: "$2.99", epsForecast: "$2.61" },
  { symbol: "ROST", eps: "$1.91", epsForecast: "$1.85" },
  { symbol: "WSM", eps: "$2.19", epsForecast: "$2.18" },
  { symbol: "GAP", eps: "$0.82", epsForecast: "$0.76" },
  { symbol: "BBWI", eps: "$0.26", epsForecast: "$0.12" },
];
const WANT: Record<string, [number, number]> = { ROST: [1.85, 1.91], WSM: [2.18, 2.19], GAP: [0.76, 0.82], BBWI: [0.12, 0.26] };

describe("0097 fillMovedFigures", () => {
  const nq = { e: { ROST: 1.85, PDD: 2.61 }, a: { ROST: 1.91, PDD: 2.99 } };
  const row = { s: "ROST", d: "2026-11-19", h: "amc", q: 3, y: 2027, eE: 1.9138, eA: null, rE: 6.4e9, rA: null, t: 1 as const, o: "https://x" };

  it("takes Nasdaq's pair for a company-dated row with no figures, never the feed's post-print estimate", () => {
    const [r] = fillMovedFigures([row], "2026-11-19", nq, () => true);
    expect(r).toMatchObject({ eE: 1.85, eA: 1.91, pr: "n", rA: null });
    expect(epsVerdict(r)).toMatchObject({ v: "beat" });
  });
  it("leaves rows without an override, on another day, already figured, non-dollar, or that Nasdaq lacks", () => {
    expect(fillMovedFigures([{ ...row, o: undefined }], "2026-11-19", nq, () => true)[0].eA).toBeNull();
    expect(fillMovedFigures([row], "2026-11-18", nq, () => true)[0].eA).toBeNull();
    expect(fillMovedFigures([{ ...row, eA: 1.9 }], "2026-11-19", nq, () => true)[0]).toMatchObject({ eA: 1.9, eE: 1.9138 });
    expect(fillMovedFigures([{ ...row, s: "PDD" }], "2026-11-19", nq, (s) => s !== "PDD")[0].eA).toBeNull();
    expect(fillMovedFigures([row], "2026-11-19", { e: { ROST: 1.85 }, a: null }, () => true)[0].eA).toBeNull();
    expect(fillMovedFigures([row], "2026-11-19", { e: {}, a: { ROST: 1.91 } }, () => true)[0].eA).toBeNull();
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

describe("0097 moved rows get the company's day's Nasdaq figures", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com") {
        if (url.pathname === "/api/calendar/earnings") {
          const rows = url.searchParams.get("date") === "2026-11-19" ? NQ19 : [{ symbol: "ZZZZ", eps: "$1.00", epsForecast: "$1.00" }];
          return new Response(JSON.stringify({ data: { rows } }));
        }
        return new Response("{}", { status: 404 });
      }
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = feed.filter((r) => (sym ? r.symbol === sym : r.date >= from && r.date <= to));
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const [from, to] of [["2026-11-16", "2026-11-22"], ["2026-11-19", "2026-11-19"], ["2026-11-01", "2026-11-30"]]) {
    it(`/api/calendar ${from}..${to} on Sat Nov 21: ROST, WSM, GAP, BBWI judged on Nasdaq's Nov 19 pair`, async () => {
      // Warm the day caches first, as production's are (2026-11-18 lesson), then read on Saturday.
      vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
      await get("/api/calendar?from=2026-11-16&to=2026-11-20");
      vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const [s, [eE, eA]] of Object.entries(WANT)) {
        const rows = r.events.filter((e: any) => e.s === s);
        expect(rows, s).toHaveLength(1);
        expect(rows[0], s).toMatchObject({ d: "2026-11-19", eE, eA, pr: "n" });
        expect(epsVerdict(rows[0]).v, s).toBe("beat");
      }
      const pdd = r.events.find((e: any) => e.s === "PDD");
      expect(pdd).toMatchObject({ d: "2026-11-19", eA: null });
      const wmt = r.events.find((e: any) => e.s === "WMT");
      expect(wmt).toMatchObject({ d: "2026-11-19", eA: 0.65 });
    });
  }

  it("a failing Nasdaq day is not asked again on every read (15-minute back-off)", async () => {
    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
    const base = (globalThis.fetch as any).getMockImplementation();
    let nqDayCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") { nqDayCalls++; return new Response("teapot", { status: 418 }); }
      return base(u);
    }));
    const first = await get("/api/calendar?from=2026-11-19&to=2026-11-19");
    expect(first.events.find((e: any) => e.s === "ROST")).toMatchObject({ eA: null });
    const after = nqDayCalls;
    for (let i = 0; i < 3; i++) await get("/api/calendar?from=2026-11-16&to=2026-11-22");
    // Later reads may build other days' caches, but never ask Nov 19 again for the moved rows.
    const nov19 = (globalThis.fetch as any).mock.calls.filter(([u]: [string]) => u.includes("api.nasdaq.com/api/calendar/earnings?date=2026-11-19")).length;
    expect(after).toBeGreaterThan(0);
    expect(nov19).toBeLessThanOrEqual(2);
  });
});
