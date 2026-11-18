import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, carryEstimates, type DateOverrides } from "../../shared/dateOverrides";
import worker from "../../worker/index";

// 0085: a row moved to the company's date kept its estimates only when the requested range also held the feed's old
// day. PDD (feed Mon Nov 16), WSM (feed Tue Nov 17) and BBWI (feed Wed Nov 18) all report Thu Nov 19, and a
// one-day "today" read of Nov 19 showed all three with no estimate while their sheets had one.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-18";
const feed = [
  { symbol: "PDD", date: "2026-11-16", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 19.213, epsActual: null, revenueEstimate: 117100000000, revenueActual: null },
  { symbol: "WSM", date: "2026-11-17", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 2.2063, epsActual: null, revenueEstimate: 2020000000, revenueActual: null },
  { symbol: "BBWI", date: "2026-11-18", hour: "", quarter: 3, year: 2027, epsEstimate: 0.1213, epsActual: null, revenueEstimate: 1581967398, revenueActual: null },
];
const WANT: Record<string, { eE: number; rE: number }> = {
  PDD: { eE: 19.213, rE: 117100000000 },
  WSM: { eE: 2.2063, rE: 2020000000 },
  BBWI: { eE: 0.1213, rE: 1581967398 },
};
const ev = (r: (typeof feed)[number]) => ({ s: r.symbol, d: r.date, h: r.hour, q: r.quarter, y: r.year, eE: r.epsEstimate, eA: null, rE: r.revenueEstimate, rA: null, t: 1 }) as any;

describe("0085 carryEstimates", () => {
  it("a WSM-shaped override in a one-day range takes its estimates from the neighbour day's row", () => {
    const here = applyToEvents([], FILE, "2026-11-19", "2026-11-19", today);
    const wsm = here.find((e) => e.s === "WSM")!;
    expect(wsm).toMatchObject({ d: "2026-11-19", eE: null, rE: null });
    const moved = applyToEvents([ev(feed[1])], FILE, "2026-10-29", "2026-12-10", today).filter((e) => e.d === "2026-11-19");
    expect(carryEstimates(here, moved).find((e) => e.s === "WSM")).toMatchObject({ d: "2026-11-19", h: "bmo", eE: 2.2063, rE: 2020000000, eA: null, rA: null });
  });

  it("a feed row on the company's day without estimates takes them from its twin, in a wide range as in a narrow one", () => {
    const onDay = { s: "WSM", d: "2026-11-19", h: "", q: 3, y: 2027, eE: null, eA: null, rE: null, rA: null, t: 1 } as any;
    const twin = { ...ev(feed[1]), pr: "s" };
    const wide = applyToEvents([twin, onDay], FILE, "2026-11-16", "2026-11-22", today).find((e) => e.s === "WSM");
    const narrow = carryEstimates(
      applyToEvents([onDay], FILE, "2026-11-19", "2026-11-19", today),
      applyToEvents([twin], FILE, "2026-10-29", "2026-12-10", today).filter((e) => e.d === "2026-11-19"),
    ).find((e) => e.s === "WSM");
    expect(wide).toMatchObject({ d: "2026-11-19", eE: 2.2063, rE: 2020000000, pr: "s", eA: null });
    expect(narrow).toEqual(wide);
  });

  it("never fills a row that isn't company-dated, one that already has an estimate, or from another day", () => {
    const plain = { s: "X", d: "2026-11-19", h: "", eE: null, rE: null, eA: null, rA: null, t: 1 } as any;
    const has = { s: "Y", d: "2026-11-19", h: "", eE: 1, rE: null, eA: null, rA: null, t: 1, o: "https://a.b" } as any;
    const other = { s: "Z", d: "2026-11-19", h: "", eE: null, rE: null, eA: null, rA: null, t: 1, o: "https://a.b" } as any;
    const moved = [
      { ...plain, o: "https://a.b", eE: 5, rE: 5 },
      { ...has, eE: 9, rE: 9 },
      { ...other, d: "2026-11-20", eE: 7, rE: 7 },
    ];
    expect(carryEstimates([plain, has, other], moved)).toEqual([plain, has, other]);
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
  expect(r.status).toBe(200);
  return r.json() as Promise<any>;
};

describe("0085 the same estimates whatever range is asked for", () => {
  let calls: string[] = [];
  beforeEach(() => {
    pending = []; calls = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T15:00:00Z")); // Nov 18, 10 am ET
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings") && !url.searchParams.get("symbol")) calls.push(`${url.searchParams.get("from")}..${url.searchParams.get("to")}`);
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

  it("after the week is read, every range holding Nov 19 carries the feed's estimates, from cache alone", async () => {
    await get("/api/calendar?from=2026-11-16&to=2026-11-22"); // warms the day caches, as production's are
    for (const [from, to] of [["2026-11-16", "2026-11-22"], ["2026-11-18", "2026-11-24"], ["2026-11-19", "2026-11-19"], ["2026-11-19", "2026-11-25"], ["2026-11-18", "2026-11-30"]]) {
      calls = [];
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const s of Object.keys(WANT)) {
        const rows = r.events.filter((e: any) => e.s === s);
        expect(rows, `${s} ${from}..${to}`).toHaveLength(1);
        expect(rows[0], `${s} ${from}..${to}`).toMatchObject({ d: "2026-11-19", h: "bmo", ...WANT[s], eA: null, rA: null });
      }
      // The estimates come from cached neighbour days: never a range call for a day already cached.
      expect(calls.filter((c) => c.split("..")[0] <= "2026-11-22"), `${from}..${to}`).toEqual([]);
    }
  });

  it("a cold neighbour leaves the estimate empty, never invented, never a 500", async () => {
    const r = await get("/api/calendar?from=2026-11-19&to=2026-11-19");
    for (const s of Object.keys(WANT)) {
      const rows = r.events.filter((e: any) => e.s === s);
      expect(rows, s).toHaveLength(1);
      expect(rows[0]).toMatchObject({ d: "2026-11-19", eE: null, rE: null });
    }
  });
});
