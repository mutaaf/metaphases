import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { epsVerdict, fillMovedFigures, judgedDayEps, nasdaqDayActuals } from "../../shared/compare";
import worker from "../../worker/index";
import { curOf, resultOf, rowCur } from "../../src/lib/data";
import { weekContext } from "../../src/lib/aiContext";

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
  // Estimates in yuan per share. Re-review (bounce 1): the row takes Nasdaq's own dollars-per-ADR pair, both figures
  // from one source on one basis, with the row's currency set to dollars and the yuan revenue estimate dropped.
  { symbol: "PDD", date: "2026-11-16", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 19.213, epsActual: null, revenueEstimate: 117133197205, revenueActual: null },
  // Release the evening before the company's date (call Nov 19, 10 a.m. ET): Nasdaq lists it on Nov 18 only.
  { symbol: "HP", date: "2026-11-19", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.2755, epsActual: null, revenueEstimate: 1105702188, revenueActual: null },
  // Feed row already on the company's day, judged on its snapshot: untouched.
  { symbol: "WMT", date: "2026-11-19", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 0.6421, epsActual: 0.65, revenueEstimate: 189143823120, revenueActual: 188835000000 },
];
// Nasdaq's day calendar for Nov 19 (live, read 2026-11-21).
const NQ19 = [
  { symbol: "WMT", eps: "$0.65", surprise: "1.56", epsForecast: "$0.64" },
  { symbol: "PDD", eps: "$2.99", surprise: "14.56", epsForecast: "$2.61" },
  { symbol: "ROST", eps: "$1.91", surprise: "3.24", epsForecast: "$1.85" },
  { symbol: "WSM", eps: "$2.19", surprise: "0.46", epsForecast: "$2.18" },
  { symbol: "GAP", eps: "$0.82", surprise: "7.89", epsForecast: "$0.76" },
  { symbol: "BBWI", eps: "$0.26", surprise: "116.67", epsForecast: "$0.12" },
];
// Nov 18 (live): HP's release, a day before its call. Its "eps" on a day it isn't listed for must not leak to others.
const NQ18 = [
  { symbol: "HP", eps: "$0.36", surprise: "63.64", epsForecast: "$0.22" },
  { symbol: "TGT", eps: "$2.15", surprise: "4.88", epsForecast: "$2.05" },
];
const WANT: Record<string, [number, number]> = { ROST: [1.85, 1.91], WSM: [2.18, 2.19], GAP: [0.76, 0.82], BBWI: [0.12, 0.26], HP: [0.22, 0.36] };

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
    expect(fillMovedFigures([row], "2026-11-19", { e: { ROST: 1.85 }, a: null }, () => true)[0].eA).toBeNull();
    expect(fillMovedFigures([row], "2026-11-19", { e: {}, a: { ROST: 1.91 } }, () => true)[0].eA).toBeNull();
  });
  it("a non-dollar row takes Nasdaq's dollar pair whole: EPS in USD per ADR (`ec`), no yuan revenue beside it", () => {
    const pdd = { ...row, s: "PDD", eE: 19.213, rE: 117133197205 };
    const [r] = fillMovedFigures([pdd], "2026-11-19", nq, (s) => s !== "PDD");
    expect(r).toMatchObject({ eE: 2.61, eA: 2.99, pr: "n", ec: "USD", rE: null, rA: null });
    expect(epsVerdict(r)).toMatchObject({ v: "beat" });
    // A dollar row never carries `ec` (its currency is the company's).
    expect(fillMovedFigures([row], "2026-11-19", nq, () => true)[0].ec).toBeUndefined();
  });
  it("the client reads a row's currency from `ec` first, so PDD's pair shows as $2.61 → $2.99, judged a beat", () => {
    const filled = fillMovedFigures([{ ...row, s: "PDD", eE: 19.213, rE: 117133197205 }], "2026-11-19", nq, (s) => s !== "PDD")[0];
    expect(curOf("PDD")).toBe("CNY");
    expect(rowCur(filled)).toBe("USD");
    expect(rowCur({ ...filled, ec: undefined })).toBe("CNY");
    expect(resultOf(filled)).toBe("beat");
    const ctx = weekContext([filled], null, "2026-11-16", "2026-11-22", "2026-11-21") as any;
    expect(JSON.stringify(ctx)).toContain('"cur":"USD"');
  });
});

// Build attempt 1 (#167) read the Worker's cached Nov 19 copy, taken after the before-open names posted but before
// the after-close ones: there ROST's and GAP's `eps` held last year's EPS ($1.58, $0.62) with no surprise yet.
const NQ19_EARLY = [
  { symbol: "WMT", eps: "$0.65", surprise: "1.56", epsForecast: "$0.64" },
  { symbol: "WSM", eps: "$2.19", surprise: "0.46", epsForecast: "$2.18" },
  { symbol: "BBWI", eps: "$0.26", surprise: "116.67", epsForecast: "$0.12" },
  { symbol: "ROST", eps: "$1.58", surprise: "N/A", epsForecast: "$1.85" },
  { symbol: "GAP", eps: "$0.62", surprise: "N/A", epsForecast: "$0.76" },
];

describe("0097 nasdaqDayActuals trusts only an eps Nasdaq has judged", () => {
  it("keeps eps that agrees with its surprise, or equals the forecast with surprise N/A (HD $3.86 vs $3.86)", () => {
    const body = { data: { rows: [
      ...NQ19_EARLY,
      { symbol: "HD", eps: "$3.86", surprise: "N/A", epsForecast: "$3.86" },
      { symbol: "LOSS", eps: "($0.12)", surprise: "40", epsForecast: "($0.20)" },
      { symbol: "ODD", eps: "$1.00", surprise: "25", epsForecast: "$0.90" },
      { symbol: "NOFC", eps: "$0.59", surprise: "N/A", epsForecast: "" },
    ] } };
    expect(nasdaqDayActuals(body)).toEqual({ WMT: 0.65, WSM: 2.19, BBWI: 0.26, HD: 3.86, LOSS: -0.12 });
  });
  it("judgedDayEps allows Nasdaq's 2-place rounding but not another figure", () => {
    expect(judgedDayEps(1.91, 1.85, 3.24)).toBe(true);
    expect(judgedDayEps(0.26, 0.12, 116.67)).toBe(true);
    expect(judgedDayEps(1.58, 1.85, null)).toBe(false);
    expect(judgedDayEps(1.58, 1.85, 3.24)).toBe(false);
    expect(judgedDayEps(0.05, 0, 0)).toBe(false);
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  ttl = new Map<string, number>();
  async put(req: Request, res: Response) {
    this.store.set(req.url, await res.text());
    this.ttl.set(req.url, Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1]));
  }
}
let nq19: Record<string, string>[] = NQ19;
let extraFeed: typeof feed = [];
// Nov 12 (live): Cisco, company-dated after the close; Finnhub had it on Nov 11.
const NQ12 = [{ symbol: "CSCO", eps: "$1.21", surprise: "5.22", epsForecast: "$1.15" }];
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
    nq19 = NQ19;
    extraFeed = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com") {
        if (url.pathname === "/api/calendar/earnings") {
          const date = url.searchParams.get("date");
          const rows = date === "2026-11-19" ? nq19 : date === "2026-11-18" ? NQ18 : date === "2026-11-12" ? NQ12 : [{ symbol: "ZZZZ", eps: "$1.00", epsForecast: "$1.00" }];
          return new Response(JSON.stringify({ data: { rows } }));
        }
        return new Response("{}", { status: 404 });
      }
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = [...feed, ...extraFeed].filter((r) => (sym ? r.symbol === sym : r.date >= from && r.date <= to));
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
      // Re-review (bounce 1): PDD, yuan estimates, judged on Nasdaq's own dollars-per-ADR pair, never "pending".
      const pdd = r.events.filter((e: any) => e.s === "PDD");
      expect(pdd).toHaveLength(1);
      expect(pdd[0]).toMatchObject({ d: "2026-11-19", eE: 2.61, eA: 2.99, pr: "n", ec: "USD", rE: null, rA: null });
      expect(epsVerdict(pdd[0]).v).toBe("beat");
      const wmt = r.events.find((e: any) => e.s === "WMT");
      expect(wmt).toMatchObject({ d: "2026-11-19", eA: 0.65 });
    });
  }

  it("a copy read before the after-close actuals posted never shows last year's EPS, and is asked again within the hour", async () => {
    nq19 = NQ19_EARLY;
    vi.setSystemTime(new Date("2026-11-20T01:00:00Z")); // Nov 19, 8 p.m. ET
    await get("/api/calendar?from=2026-11-16&to=2026-11-20");
    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
    const early = await get("/api/calendar?from=2026-11-16&to=2026-11-22");
    // Listed on Nov 19 but not judged yet: they wait for Nov 19, never borrow another day's figures.
    for (const s of ["ROST", "GAP"]) expect(early.events.find((e: any) => e.s === s), s).toMatchObject({ d: "2026-11-19", eA: null });
    expect(early.events.find((e: any) => e.s === "HP")).toMatchObject({ d: "2026-11-19", eE: 0.22, eA: 0.36, pr: "n" });
    expect(early.events.find((e: any) => e.s === "WSM")).toMatchObject({ eE: 2.18, eA: 2.19, pr: "n" });
    const cache = (globalThis as any).caches.default as MemCache;
    const key = [...cache.store.keys()].find((k) => k.includes("nq%3Acal%3Av3%3A2026-11-19"));
    expect(key).toBeTruthy();
    expect(cache.ttl.get(key!)).toBe(3600);
    // An hour on, the copy has expired and Nasdaq has posted Ross and Gap.
    cache.store.delete(key!);
    nq19 = NQ19;
    const late = await get("/api/calendar?from=2026-11-16&to=2026-11-22");
    expect(late.events.find((e: any) => e.s === "ROST")).toMatchObject({ eE: 1.85, eA: 1.91, pr: "n" });
    expect(late.events.find((e: any) => e.s === "GAP")).toMatchObject({ eE: 0.76, eA: 0.82, pr: "n" });
  });

  it("an older moved day still fills in a month range while newer days hold rows that can't fill yet (one answer per range, 0041)", async () => {
    nq19 = NQ19_EARLY; // ROST and GAP listed on Nov 19 but not judged
    extraFeed = [
      { symbol: "CSCO", date: "2026-11-11", hour: "amc", quarter: 1, year: 2027, epsEstimate: 1.2111, epsActual: null, revenueEstimate: 15e9, revenueActual: null },
      // Company-dated rows Nasdaq doesn't list on their day or the day before (they can't fill).
      { symbol: "TSN", date: "2026-11-16", hour: "bmo", quarter: 4, year: 2026, epsEstimate: 0.5885, epsActual: null, revenueEstimate: 14e9, revenueActual: null },
      { symbol: "PANW", date: "2026-11-18", hour: "amc", quarter: 1, year: 2027, epsEstimate: 0.9907, epsActual: null, revenueEstimate: 2.6e9, revenueActual: null },
    ];
    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
    for (const [from, to] of [["2026-11-09", "2026-11-15"], ["2026-11-01", "2026-11-30"]]) {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      expect(r.events.find((e: any) => e.s === "CSCO"), from).toMatchObject({ d: "2026-11-12", eE: 1.15, eA: 1.21, pr: "n" });
    }
  });

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
    // A non-dollar row with no Nasdaq pair gets no figures and no `ec`: nothing is invented (it stays pending).
    const pdd = first.events.find((e: any) => e.s === "PDD");
    expect(pdd.eA).toBeNull();
    expect(pdd.pr).toBeUndefined();
    expect(pdd.ec).toBeUndefined();
    const after = nqDayCalls;
    for (let i = 0; i < 3; i++) await get("/api/calendar?from=2026-11-16&to=2026-11-22");
    // Later reads may build other days' caches, but never ask Nov 19 again for the moved rows.
    const nov19 = (globalThis.fetch as any).mock.calls.filter(([u]: [string]) => u.includes("api.nasdaq.com/api/calendar/earnings?date=2026-11-19")).length;
    expect(after).toBeGreaterThan(0);
    expect(nov19).toBeLessThanOrEqual(2);
  });
});
