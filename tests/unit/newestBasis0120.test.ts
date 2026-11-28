import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

// 0120: the critic's 2026-11-28 07:00 check. The newest quarter on two sheets read "basis differs" although Nasdaq
// gives both figures in one table:
//   KSS Nov 24 bmo: Nasdaq −$0.01 → $0.32 (0094's turnaround); Finnhub's calendar −$0.0017 → $0.32. Stock +19.5%.
//   URBN Nov 24 amc: Nasdaq $1.53 → $1.54; Finnhub's calendar row sits on Nov 23 (0119's day-early row).
// Both read "Beat 3 of its last 3" instead of 4 of 4.

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
  vi.setSystemTime(new Date("2026-11-28T15:00:00Z"));
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
const row = (fiscalQtrEnd: string, dateReported: string, eps: number, consensusForecast: string) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: "0" });
const cal = (symbol: string, date: string, hour: string, quarter: number, year: number, epsEstimate: number, epsActual: number | null) =>
  ({ symbol, date, hour, quarter, year, epsEstimate, epsActual, revenueEstimate: null, revenueActual: null });

const kssNq = () => [row("Oct 2026", "11/24/2026", 0.32, "-0.01"), row("Jul 2026", "8/26/2026", 1.28, "0.55"), row("Apr 2026", "5/28/2026", -0.13, "-0.18"), row("Jan 2026", "3/10/2026", 1.07, "0.85")];
const urbnNq = () => [row("Oct 2026", "11/24/2026", 1.54, "1.53"), row("Jul 2026", "8/26/2026", 1.72, "1.72"), row("Apr 2026", "5/20/2026", 1.3, "1.12"), row("Jan 2026", "2/25/2026", 1.43, "1.24")];

describe("worker /api/ticker: the newest quarter is judged on Nasdaq's own pair (0120)", () => {
  it("KSS: Finnhub's −$0.0017 estimate beside Nasdaq's −$0.01 → $0.32: a beat, record 4 of 4", async () => {
    calRows = [cal("KSS", "2026-11-24", "bmo", 3, 2027, -0.0017, 0.32), cal("KSS", "2027-03-09", "bmo", 4, 2027, 1.1, null)];
    surprises = [];
    nqSurprise = kssNq();
    const r = await get("/api/ticker/KSS");
    const nov = r.history.find((h: any) => h.date === "2026-11-24");
    expect(nov).toMatchObject({ epsE: -0.01, epsA: 0.32 });
    expect(nov.basis).toBeUndefined();
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
    expect(JSON.stringify(r.read)).not.toContain("3 of its last 3");
  });

  it("URBN: the calendar's row a day before Nasdaq's (Nov 23 vs Nov 24) is the same report: +0.65%, record 4 of 4", async () => {
    calRows = [cal("URBN", "2026-11-23", "", 3, 2027, 1.53, 1.54), cal("URBN", "2027-02-23", "amc", 4, 2027, 1.6724, null)];
    // Finnhub has the three older quarters but not Nov's yet; one older actual is on another measure (1.10 against
    // Nasdaq's 1.43), so 0096's mix test fires and used to catch the newest row, which was Nasdaq's alone.
    surprises = [
      { period: "2026-09-30", quarter: 2, year: 2027, estimate: 1.72, actual: 1.72 },
      { period: "2026-06-30", quarter: 1, year: 2027, estimate: 1.12, actual: 1.3 },
      { period: "2026-03-31", quarter: 4, year: 2026, estimate: 1.24, actual: 1.1 },
    ];
    nqSurprise = urbnNq();
    const r = await get("/api/ticker/URBN");
    const nov = r.history.find((h: any) => h.date === "2026-11-24");
    expect(nov.basis).toBeUndefined();
    expect(nov.surprisePct).toBeCloseTo(0.65, 1);
    expect(r.history.filter((h: any) => h.date === "2026-11-23")).toEqual([]); // one row per report
    expect(r.beatRate.total).toBe(4);
  });

  it("URBN with no Finnhub quarters at all: unchanged, 4 of 4", async () => {
    calRows = [cal("URBN", "2026-11-23", "", 3, 2027, 1.53, 1.54), cal("URBN", "2027-02-23", "amc", 4, 2027, 1.6724, null)];
    surprises = [];
    nqSurprise = urbnNq();
    const r = await get("/api/ticker/URBN");
    expect(r.history.filter((h: any) => h.basis)).toEqual([]);
    expect(r.beatRate.total).toBe(4);
  });

  it("CRWD-style mix stays 'basis differs': the calendar's $0.31 against Nasdaq's $0.01 is another measure", async () => {
    calRows = [cal("CRWD", "2026-08-26", "amc", 2, 2027, 0.29, 0.31), cal("CRWD", "2026-12-02", "amc", 3, 2027, 0.3176, null)];
    surprises = [];
    nqSurprise = [row("Jul 2026", "8/27/2026", 0.01, "0.05"), row("Apr 2026", "6/3/2026", 0.04, "0.03"), row("Jan 2026", "3/3/2026", 0.06, "0.05")];
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
    const r = await get("/api/ticker/CRWD");
    const aug = r.history.find((h: any) => h.date === "2026-08-27");
    expect(aug).toMatchObject({ epsE: 0.29, epsA: 0.31 });
    expect(aug.basis).toBeUndefined();
    expect(r.history.filter((h: any) => h.basis).map((h: any) => h.date)).toEqual(["2026-06-03", "2026-03-03"]);
  });  it("KSS with the calendar a day early (Nov 23): still the same report, a beat, 4 of 4, session from the habit", async () => {
    calRows = [cal("KSS", "2026-11-23", "amc", 3, 2027, -0.0017, 0.32), cal("KSS", "2027-03-09", "bmo", 4, 2027, 1.1, null)];
    surprises = [];
    nqSurprise = kssNq();
    const r = await get("/api/ticker/KSS");
    const nov = r.history.find((h: any) => h.date === "2026-11-24");
    expect(nov).toMatchObject({ epsE: -0.01, epsA: 0.32 });
    expect(nov.basis).toBeUndefined();
    expect(nov.session).not.toBe("amc"); // the misdated row's own session belongs to its own day
    expect(r.history.filter((h: any) => h.date === "2026-11-23")).toEqual([]);
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
  });

  it("review: a calendar row near an OLDER Nasdaq row (a late filer's two reports) never lends it figures", async () => {
    // Nasdaq lists the delayed Q2 (Nov 20) but not Q3 yet; the calendar's last row is Q3 on Nov 22 with its own print.
    calRows = [cal("LATE", "2026-11-22", "bmo", 3, 2027, 0.3, 0.6), cal("LATE", "2027-03-01", "bmo", 4, 2027, 0.5, null)];
    surprises = [];
    nqSurprise = [row("Oct 2026", "11/24/2026", 0.62, "0.5"), row("Jul 2026", "11/20/2026", 0.4, "0.45"), row("Apr 2026", "5/20/2026", 0.4, "0.38")];
    const r = await get("/api/ticker/LATE");
    expect(r.history.find((h: any) => h.date === "2026-11-20")).toMatchObject({ epsE: 0.45, epsA: 0.4 });
  });
});


// 0120 attempt 2: production on 2026-11-28 13:03 (build 3ab02d79) still read "basis differs". Finnhub had each
// report's estimate but not its actual yet (Nasdaq posts first), so the calendar row lent no actual.
describe("worker /api/ticker: the feed has the estimate but not the actual yet (0120, live shape)", () => {
  it("KSS: Finnhub −$0.0017 with no actual, Nasdaq −$0.01 → $0.32: a beat on Nasdaq's own pair, 4 of 4", async () => {
    calRows = [cal("KSS", "2026-11-24", "bmo", 3, 2027, -0.0017, null), cal("KSS", "2027-03-09", "bmo", 4, 2027, 1.1, null)];
    surprises = [
      { period: "2026-09-30", quarter: 2, year: 2027, estimate: 0.5512, actual: 1.28 },
      { period: "2026-06-30", quarter: 1, year: 2027, estimate: -0.19, actual: -0.13 },
      { period: "2026-03-31", quarter: 4, year: 2026, estimate: 0.86, actual: 1.07 },
    ];
    nqSurprise = kssNq();
    const r = await get("/api/ticker/KSS");
    const nov = r.history.find((h: any) => h.date === "2026-11-24");
    expect(nov).toMatchObject({ epsE: -0.01, epsA: 0.32 });
    expect(nov.basis).toBeUndefined();
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
  });

  it("URBN: Finnhub's Nov 23 row with $1.53 and no actual corroborates Nasdaq's $1.53 → $1.54: +0.65%, 4 of 4", async () => {
    calRows = [cal("URBN", "2026-11-23", "", 3, 2027, 1.5312, null), cal("URBN", "2027-02-23", "amc", 4, 2027, 1.6724, null)];
    surprises = [
      { period: "2026-09-30", quarter: 2, year: 2027, estimate: 1.72, actual: 1.72 },
      { period: "2026-06-30", quarter: 1, year: 2027, estimate: 1.12, actual: 1.3 },
      { period: "2026-03-31", quarter: 4, year: 2026, estimate: 1.24, actual: 1.1 },
    ];
    nqSurprise = urbnNq();
    const r = await get("/api/ticker/URBN");
    const nov = r.history.find((h: any) => h.date === "2026-11-24");
    expect(nov.basis).toBeUndefined();
    expect(nov.surprisePct).toBeCloseTo(0.65, 1);
    expect(r.beatRate.total).toBe(4);
  });

  it("a feed estimate on another basis (CRWD $0.29 vs Nasdaq's $0.05, no feed actual) doesn't vouch for Nasdaq's pair", async () => {
    vi.setSystemTime(new Date("2026-09-01T15:00:00Z"));
    calRows = [cal("CRWD", "2026-08-26", "amc", 2, 2027, 0.29, null), cal("CRWD", "2026-12-02", "amc", 3, 2027, 0.3176, null)];
    surprises = [];
    nqSurprise = [row("Jul 2026", "8/27/2026", 0.01, "0.05"), row("Apr 2026", "6/3/2026", 0.04, "0.03"), row("Jan 2026", "3/3/2026", 0.06, "0.05")];
    const r = await get("/api/ticker/CRWD");
    expect(r.history.find((h: any) => h.date === "2026-08-27").basis).toBe("differs");
  });
});
