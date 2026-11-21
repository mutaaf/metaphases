import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { EPS_OFF_BASIS_RATIO, matchQuarters, nasdaqHistoryOffBasis, periodKey } from "../../shared/compare";

// 0096: for GAAP-loss software (CRWD, SNOW, ZS, ASAN, MDB, IOT) Nasdaq's `earnings-surprise` pair isn't the adjusted
// EPS the company headlines, while the sheet's next estimate is Finnhub's adjusted figure. Nasdaq rows below are the
// ones quoted in the critic's 2026-11-20 19:00 check; the Finnhub CRWD quarter is the company's Q2 FY27 release
// ($0.31 non-GAAP vs $0.29 consensus).

const nq = (key: string, reported: string) => ({ key: periodKey(key), reported });

describe("matchQuarters: Finnhub's calendar quarter-end labels meet Nasdaq's fiscal months (0096)", () => {
  const crwd = [nq("Jul 2026", "2026-08-26"), nq("Apr 2026", "2026-06-03"), nq("Jan 2026", "2026-03-03"), nq("Oct 2025", "2025-12-02")];
  // CRWD's next report: fiscal Q3 2027 on Dec 1 (Finnhub's calendar numbers quarters as stock/earnings does).
  const next = { date: "2026-12-01", quarter: 3, year: 2027 };
  // As production showed (LESSONS 2026-11-21): the Jul-31 quarter is "2026-09-30", the Apr-30 one "2026-06-30".
  const fh = [
    { period: "2026-09-30", quarter: 2, year: 2027, e: "Q2" },
    { period: "2026-06-30", quarter: 1, year: 2027, e: "Q1" },
    { period: "2026-03-31", quarter: 4, year: 2026, e: "Q4" },
    { period: "2025-12-31", quarter: 3, year: 2026, e: "Q3" },
  ];
  it("CRWD: 'Jul 2026' is Finnhub's '2026-09-30', fiscal Q2 2027, and every row takes its own quarter", () => {
    expect(matchQuarters(crwd, fh, next).map((f) => f?.e)).toEqual(["Q2", "Q1", "Q4", "Q3"]);
  });
  it("#164's regression: Nasdaq's Jul quarter is never paired with Finnhub's '2026-06-30' (the Apr quarter)", () => {
    const m = matchQuarters(crwd, fh.slice(1), next); // Finnhub hasn't got the Jul quarter
    expect(m[0]).toBeUndefined();
    expect(m.slice(1).map((f) => f?.e)).toEqual(["Q1", "Q4", "Q3"]);
  });
  it("a label convention we guessed wrong (Jul quarter labelled 06-30) pairs nothing rather than the neighbour", () => {
    const shifted = [
      { period: "2026-06-30", quarter: 2, year: 2027 }, { period: "2026-03-31", quarter: 1, year: 2027 },
      { period: "2025-12-31", quarter: 4, year: 2026 }, { period: "2025-09-30", quarter: 3, year: 2026 },
    ];
    expect(matchQuarters(crwd, shifted, next)).toEqual([undefined, undefined, undefined, undefined]);
  });
  it("KSS (quarter to Aug 1, Nasdaq 'Jul 2026'): its own quarter, never Apr's −$0.19 → −$0.13", () => {
    const kss = [nq("Jul 2026", "2026-08-26"), nq("Apr 2026", "2026-05-28"), nq("Jan 2026", "2026-03-10"), nq("Oct 2025", "2025-11-25")];
    const k = [
      { period: "2026-09-30", quarter: 2, year: 2026, e: 1.28 }, { period: "2026-06-30", quarter: 1, year: 2026, e: -0.13 },
      { period: "2026-03-31", quarter: 4, year: 2025, e: 1.07 }, { period: "2025-12-31", quarter: 3, year: 2025, e: 0.1 },
    ];
    expect(matchQuarters(kss, k, { date: "2026-11-24", quarter: 3, year: 2026 }).map((f) => f?.e)).toEqual([1.28, -0.13, 1.07, 0.1]);
  });
  it("no anchor (no calendar row with a fiscal quarter): only exact labels match", () => {
    expect(matchQuarters(crwd, fh, null)).toEqual([undefined, undefined, undefined, undefined]);
    expect(matchQuarters(crwd, fh, { date: "2026-12-01" })).toEqual([undefined, undefined, undefined, undefined]);
  });
  it("an exact fiscal label still matches without an anchor", () => {
    const exact = [{ period: "2026-07-31", e: 1 }, { period: "2026-04-30", e: 2 }];
    expect(matchQuarters(crwd, exact).map((f) => f?.e)).toEqual([1, 2, undefined, undefined]);
  });
  it("a calendar-quarter company keeps its exact match (AAPL 'Sep 2026' ↔ '2026-09-30')", () => {
    const a = [{ period: "2026-09-30", e: 1 }, { period: "2026-06-30", e: 2 }];
    expect(matchQuarters([nq("Sep 2026", "2026-11-02"), nq("Jun 2026", "2026-07-30")], a).map((f) => f?.e)).toEqual([1, 2]);
  });
  it("two rows claiming one Finnhub quarter: neither takes it", () => {
    const dup = [nq("Jul 2026", "2026-08-26"), nq("Aug 2026", "2026-08-27")];
    expect(matchQuarters(dup, fh, next)).toEqual([undefined, undefined]);
  });
  it("a row with no readable report date, or junk periods: nothing matches", () => {
    expect(matchQuarters([{ key: "2026-07", reported: "undefined-0N-/A" }], fh, next)).toEqual([undefined]);
    expect(matchQuarters(crwd, null, next)).toEqual([undefined, undefined, undefined, undefined]);
    expect(matchQuarters(crwd, [{ period: 7 }, {}] as any, next)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("nasdaqHistoryOffBasis: an adjusted next estimate against a GAAP-style record (0096)", () => {
  it("ZS: $1.19 next against $0.14 at most", () => expect(nasdaqHistoryOffBasis([0.14, -0.03, -0.08, -0.01], 1.1947)).toBe(true));
  it("CRWD: $0.32 next against $0.06 at most", () => expect(nasdaqHistoryOffBasis([0.01, 0.04, 0.06, 0], 0.3176)).toBe(true));
  it("ASAN / SNOW: a positive estimate against nothing but losses", () => {
    expect(nasdaqHistoryOffBasis([-0.15, -0.06], 0.08)).toBe(true);
    expect(nasdaqHistoryOffBasis([-0.44, -0.42, -0.35, -0.3], 0.61)).toBe(true);
  });
  it("KSS / M and seasonal retailers stay a record (0094 not regressed)", () => {
    expect(nasdaqHistoryOffBasis([1.28, -0.13, 1.07, 0.1], -0.2)).toBe(false);
    expect(nasdaqHistoryOffBasis([0.09, 0.13, 1.8, 0.2], 0.15)).toBe(false);
    expect(nasdaqHistoryOffBasis([0.5, 0.6, 0.55, 1.6], 0.6)).toBe(false);
  });
  it("Finnhub's own actual decides first: a mix settles it, agreement rules it out (a turnaround's adjusted losses)", () => {
    expect(nasdaqHistoryOffBasis([0.01, 0.04], 0.3176, [{ nq: 0.01, fh: 0.31 }])).toBe(true);
    // Cruise-line-shaped turnaround: Nasdaq's losses are the adjusted ones Finnhub also has, so the record stands.
    expect(nasdaqHistoryOffBasis([-0.85, -0.55, -0.31], 0.74, [{ nq: -0.31, fh: -0.31 }, { nq: -0.55, fh: -0.5501 }])).toBe(false);
  });
  it("near-zero small caps and short tables aren't caught by the 3× test", () => {
    expect(nasdaqHistoryOffBasis([0.01, 0.02, 0.03, 0.02], 0.1)).toBe(false); // under 20¢ next
    expect(nasdaqHistoryOffBasis([0.05, 0.06], 0.4)).toBe(false); // two quarters can't show a year's seasons
  });
  it("a growing company inside 3× stays a record; a near-zero or missing estimate decides nothing", () => {
    expect(nasdaqHistoryOffBasis([2.22, 1.87, 1.57, 1.24], 2.8076)).toBe(false);
    expect(nasdaqHistoryOffBasis([0.01, 0.02], 0.03)).toBe(false);
    expect(nasdaqHistoryOffBasis([0.01, 0.02], null)).toBe(false);
    expect(nasdaqHistoryOffBasis([0.01], 1)).toBe(false); // one row isn't a record to compare
    expect(EPS_OFF_BASIS_RATIO).toBe(3);
  });
});

// ── Worker: the sheet's history and beat record ─────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
  async delete(req: Request) { return this.store.delete(req.url); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let nqSurprise: any[] = [];
let surprises: any[] = [];
let calRows: any[] = [];

beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise } } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { rows: null } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      return new Response(JSON.stringify({ earningsCalendar: calRows.filter((r) => !sym || r.symbol === sym) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response(JSON.stringify(surprises));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const next = (symbol: string, epsEstimate: number) => [{ symbol, date: "2026-12-02", hour: "amc", quarter: 3, year: 2027, epsEstimate, epsActual: null, revenueEstimate: null, revenueActual: null }];
const row = (fiscalQtrEnd: string, dateReported: string, eps: number, consensusForecast: string) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: "0" });

describe("worker /api/ticker (0096)", () => {
  it("CRWD: Finnhub's quarter labelled 2026-09-30 (fiscal Q2 2027) sets the Aug 26 row (a $0.29 → $0.31 beat), never Nasdaq's $0.05 → $0.01 miss", async () => {
    calRows = next("CRWD", 0.3176);
    surprises = [{ period: "2026-09-30", quarter: 2, year: 2027, estimate: 0.29, actual: 0.31, surprisePercent: 6.9 }];
    nqSurprise = [row("Jul 2026", "8/26/2026", 0.01, "0.05"), row("Apr 2026", "6/3/2026", 0.04, "0.03"), row("Jan 2026", "3/3/2026", 0.06, "0.05"), row("Oct 2025", "12/2/2025", 0, "0.02")];
    const r = await get("/api/ticker/CRWD");
    const aug = r.history.find((h: any) => h.date === "2026-08-26");
    expect(aug).toMatchObject({ epsE: 0.29, epsA: 0.31 });
    expect(aug.basis).toBeUndefined();
    // The three Nasdaq-only quarters are on another basis from the $0.32 next estimate: out of the record.
    expect(r.history.filter((h: any) => h.basis).map((h: any) => h.date)).toEqual(["2026-06-03", "2026-03-03", "2025-12-02"]);
    expect(r.beatRate).toEqual({ beats: 1, total: 1 });
  });

  it("ZS: no Finnhub quarter, Nasdaq's $0.06 → $0.14 beside a $1.19 next estimate reads 'basis differs'", async () => {
    calRows = next("ZS", 1.1947);
    surprises = [];
    nqSurprise = [row("Jul 2026", "9/3/2026", 0.14, "0.06"), row("Apr 2026", "5/26/2026", -0.03, "-0.04"), row("Jan 2026", "2/26/2026", -0.08, "-0.05"), row("Oct 2025", "11/25/2025", -0.01, "-0.05")];
    const r = await get("/api/ticker/ZS");
    expect(r.history.every((h: any) => h.basis === "differs" && h.surprisePct == null)).toBe(true);
    expect(r.beatRate).toBeNull();
  });

  it("ASAN: Nasdaq's losses beside a $0.08 adjusted estimate: the Sep 3 row is never a miss", async () => {
    calRows = next("ASAN", 0.08);
    surprises = [];
    nqSurprise = [row("Jul 2026", "9/3/2026", -0.15, "-0.11"), row("Apr 2026", "5/28/2026", -0.06, "-0.14")];
    const r = await get("/api/ticker/ASAN");
    expect(r.history.find((h: any) => h.date === "2026-09-03").basis).toBe("differs");
    expect(r.beatRate).toBeNull();
  });

  it("KSS with a next estimate: Nasdaq's own record stands, 4 of 4 (0094)", async () => {
    calRows = next("KSS", -0.2);
    surprises = [];
    nqSurprise = [row("Jul 2026", "8/26/2026", 1.28, "0.55"), row("Apr 2026", "5/28/2026", -0.13, "-0.18"), row("Jan 2026", "3/10/2026", 1.07, "0.85"), row("Oct 2025", "11/25/2025", 0.1, "-0.19")];
    const r = await get("/api/ticker/KSS");
    expect(r.history.filter((h: any) => h.basis)).toEqual([]);
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
  });
});

describe("worker /api/ticker: #164's live failure shapes (0096 attempt 2)", () => {
  it("KSS with Finnhub's quarters: the Aug 26 row keeps its own quarter (never Apr's −$0.19 → −$0.13), record 4 of 4", async () => {
    calRows = [{ symbol: "KSS", date: "2026-11-24", hour: "bmo", quarter: 3, year: 2026, epsEstimate: -0.0017, epsActual: null, revenueEstimate: null, revenueActual: null }];
    surprises = [
      { period: "2026-09-30", quarter: 2, year: 2026, estimate: 0.5512, actual: 1.28 },
      { period: "2026-06-30", quarter: 1, year: 2026, estimate: -0.19, actual: -0.13 },
      { period: "2026-03-31", quarter: 4, year: 2025, estimate: 0.86, actual: 1.07 },
      { period: "2025-12-31", quarter: 3, year: 2025, estimate: -0.2, actual: 0.1 },
    ];
    nqSurprise = [row("Jul 2026", "8/26/2026", 1.28, "0.55"), row("Apr 2026", "5/28/2026", -0.13, "-0.18"), row("Jan 2026", "3/10/2026", 1.07, "0.85"), row("Oct 2025", "11/25/2025", 0.1, "-0.19")];
    const r = await get("/api/ticker/KSS");
    const aug = r.history.find((h: any) => h.date === "2026-08-26");
    expect(aug.epsA).toBe(1.28);
    expect(aug.epsE).not.toBe(-0.19);
    expect(r.history.filter((h: any) => h.basis)).toEqual([]);
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
  });

  it("CRWD with all four Finnhub quarters: four adjusted beats, no Nasdaq GAAP-style pair, CRWD's newest quarter kept", async () => {
    calRows = next("CRWD", 0.3176);
    surprises = [
      { period: "2026-09-30", quarter: 2, year: 2027, estimate: 0.29, actual: 0.31 },
      { period: "2026-06-30", quarter: 1, year: 2027, estimate: 0.2722, actual: 0.275 },
      { period: "2026-03-31", quarter: 4, year: 2026, estimate: 0.3, actual: 0.33 },
      { period: "2025-12-31", quarter: 3, year: 2026, estimate: 0.18, actual: 0.2 },
    ];
    nqSurprise = [row("Jul 2026", "8/26/2026", 0.01, "0.05"), row("Apr 2026", "6/3/2026", 0.04, "0.03"), row("Jan 2026", "3/3/2026", 0.06, "0.05"), row("Oct 2025", "12/2/2025", 0, "0.02")];
    const r = await get("/api/ticker/CRWD");
    expect(r.history.slice(0, 4).map((h: any) => [h.date, h.epsE, h.epsA])).toEqual([
      ["2026-08-26", 0.29, 0.31], ["2026-06-03", 0.2722, 0.275], ["2026-03-03", 0.3, 0.33], ["2025-12-02", 0.18, 0.2],
    ]);
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
  });
});

describe("worker /api/ticker: one judged quarter isn't a track record (0096)", () => {
  it("CRWD with 1 of 1 judged: no 'habitually beats' factor", async () => {
    calRows = next("CRWD", 0.3176);
    surprises = [{ period: "2026-09-30", quarter: 2, year: 2027, estimate: 0.29, actual: 0.31, surprisePercent: 6.9 }];
    nqSurprise = [row("Jul 2026", "8/26/2026", 0.01, "0.05"), row("Apr 2026", "6/3/2026", 0.04, "0.03")];
    const r = await get("/api/ticker/CRWD");
    expect(r.beatRate).toEqual({ beats: 1, total: 1 });
    expect(JSON.stringify(r.setup)).not.toContain("Habitually beats");
  });
});

describe("worker /api/ticker: REITs are left to 0049 (0096)", () => {
  it("a REIT's FFO record isn't marked by the 3× test", async () => {
    calRows = next("UDR", 2.5);
    surprises = [];
    nqSurprise = [row("Sep 2026", "10/28/2026", 0.65, "0.64"), row("Jun 2026", "7/30/2026", 0.64, "0.63"), row("Mar 2026", "4/29/2026", 0.63, "0.62")];
    const r = await get("/api/ticker/UDR");
    expect(r.history.filter((h: any) => h.basis)).toEqual([]);
  });
});
