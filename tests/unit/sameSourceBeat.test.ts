import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { applyPreReport, epsVerdict, judgeReaction, nasdaqDayActuals, nasdaqDayEps } from "../../shared/compare";
import { seasonScore } from "../../shared/depth";
import { reportedLine, tickerShareDesc } from "../../shared/reported";
import { tickerShareTitle } from "../../shared/pending";
import { resultOf, surprise } from "../../src/lib/data";
import { retraceContext } from "../../src/lib/aiContext";
import type { EarningsEvent, TickerResponse } from "../../shared/types";

// 0058: a beat is judged with an estimate and an actual from the same source. Rows from the critic's
// Nov 2–3 2026 check: Finnhub's actual against Nasdaq's estimate, and Nasdaq's own actual.

const ev = (s: string, eA: number, eE: number, extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d: "2026-11-03", h: "amc", q: 3, y: 2026, eE, eA, rE: null, rA: null, t: 1, ...extra });

const CASES = [
  { s: "LITE", eA: 4.57, nqE: 3.82, nqA: 3.76, v: "miss" },
  { s: "VRTX", eA: 4.76, nqE: 4.36, nqA: 4.21, v: "miss" },
  { s: "APO", eA: 2.07, nqE: 2.04, nqA: 1.82, v: "miss" },
  { s: "AMD", eA: 2.09, nqE: 1.68, nqA: 1.84, v: "beat" },
] as const;

describe("epsVerdict judges Nasdaq's estimate with Nasdaq's actual (0058)", () => {
  for (const c of CASES) {
    it(`${c.s}: ${c.eA} (Finnhub) vs ${c.nqE} (Nasdaq est), Nasdaq actual ${c.nqA} → ${c.v}`, () => {
      const j = epsVerdict({ eA: c.eA, eE: c.nqE, nA: c.nqA });
      expect(j.v).toBe(c.v);
      expect(j.act).toBe(c.nqA);
      expect(j.pct).toBeCloseTo(((c.nqA - c.nqE) / c.nqE) * 100, 5);
    });
  }
  it("AMD's surprise is about +9.5%, not +24.4%", () => {
    expect(epsVerdict({ eA: 2.09, eE: 1.68, nA: 1.84 }).pct).toBeCloseTo(9.52, 1);
  });
  it("Nasdaq has no actual for the row yet (null): not judged yet, never a mixed pair, and not called a basis mismatch", () => {
    expect(epsVerdict({ eA: 4.57, eE: 3.82, nA: null })).toMatchObject({ v: null, pct: null, pending: true });
  });
  it("no nA (Finnhub-only or same figure): judged as before", () => {
    expect(epsVerdict({ eA: 3.57, eE: 3.36 })).toMatchObject({ v: "beat" });
    expect(epsVerdict({ eA: 3.57, eE: 3.36 }).act).toBeUndefined();
  });
});

describe("applyPreReport pairs Nasdaq's estimate with Nasdaq's actual (0058)", () => {
  const nqE = { LITE: 3.82, VRTX: 4.36, APO: 2.04, AMD: 1.68, MCD: 3.36, SMCI: 1.04 };
  const nqA = { LITE: 3.76, VRTX: 4.21, APO: 1.82, AMD: 1.84, MCD: 3.57, SMCI: 1.7 };
  // Finnhub's (revised) estimates sit near the print, so Nasdaq's pre-report figure is swapped in (0035).
  const rows = [ev("LITE", 4.57, 4.4), ev("VRTX", 4.76, 4.5), ev("APO", 2.07, 2.05), ev("AMD", 2.09, 1.94), ev("MCD", 3.57, 3.4), ev("SMCI", 1.81, 1.2), ev("NOAC", 1.1, 1.0)];
  const { events } = applyPreReport(rows, {}, { ...nqE, NOAC: 0.95 }, () => true, false, nqA);
  const by = (s: string) => events.find((e) => e.s === s)!;

  it("rows whose actuals differ carry Nasdaq's actual; the shown actual stays Finnhub's", () => {
    expect(by("LITE")).toMatchObject({ eA: 4.57, eE: 3.82, nA: 3.76, pr: "n" });
    expect(by("AMD")).toMatchObject({ eA: 2.09, eE: 1.68, nA: 1.84, pr: "n" });
  });
  it("LITE, VRTX and APO are misses on every calendar surface; AMD is a +9.5% beat", () => {
    for (const s of ["LITE", "VRTX", "APO"]) expect(resultOf(by(s)), s).toBe("miss");
    expect(resultOf(by("AMD"))).toBe("beat");
    expect(surprise(by("AMD"))).toBeCloseTo(9.52, 1);
    expect(surprise(by("SMCI"))).toBeCloseTo(63.46, 1); // not +74%
  });
  it("MCD's two figures really are on one basis: no nA, judged as before", () => {
    expect(by("MCD").nA).toBeUndefined();
    expect(resultOf(by("MCD"))).toBe("beat");
  });
  it("a row Nasdaq has no actual for isn't judged (yet)", () => {
    expect(by("NOAC")).toMatchObject({ eE: 0.95, pr: "n", nA: null });
    expect(resultOf(by("NOAC"))).toBeNull();
    expect(surprise(by("NOAC"))).toBeNull();
  });
  it("seasonScore never counts a mixed pair as a beat", () => {
    const sc = seasonScore([by("LITE"), by("VRTX"), by("APO"), by("AMD"), by("NOAC")], () => true, 500, "2026-11-01", "2026-11-07");
    expect(sc.epsBeatPct).toBe(25); // AMD alone of the four judged
    expect(sc.medianSurprise).toBeLessThan(0);
  });
  it("Retrace's AI context gets the judged pair, not the mixed one", () => {
    const ctx = JSON.stringify(retraceContext([by("LITE")] as any, "2026-11"));
    expect(ctx).not.toContain("4.57");
  });
  it("snapshotted rows (pr: s) are untouched", () => {
    const { events: s } = applyPreReport([ev("LITE", 4.57, 4.4)], { LITE: { eE: 4.3, rE: null } }, nqE, () => true, false, nqA);
    expect(s[0]).toMatchObject({ eE: 4.3, pr: "s" });
    expect(s[0].nA).toBeUndefined();
  });
});

describe("Nasdaq's day calendar columns (0058)", () => {
  const body = { data: { rows: [
    { symbol: "AMD", eps: "$1.84", epsForecast: "$1.68" },
    { symbol: "APO", eps: "$1.82", epsForecast: "$2.04" },
    { symbol: "LOSS", eps: "($0.12)", epsForecast: "($0.20)" },
    { symbol: "SOON", eps: "", epsForecast: "$1.00" },
  ] } };
  it("reads the reported EPS beside the forecast", () => {
    expect(nasdaqDayActuals(body)).toEqual({ AMD: 1.84, APO: 1.82, LOSS: -0.12 });
    expect(nasdaqDayEps(body)).toEqual({ AMD: 1.68, APO: 2.04, LOSS: -0.2, SOON: 1 });
  });
});

describe("the sheet's lines say which pair was judged (0058)", () => {
  const fmt = (v: number) => `$${v.toFixed(2)}`;
  it("reportedLine names the company's figure and the judged pair, never a +20% beat", () => {
    const line = reportedLine("Lumentum", { date: "2026-11-02", session: "amc", quarter: 1, epsE: 3.82, epsA: 4.57, nA: 3.76 }, "2026-11-03", fmt);
    expect(line).toBe("Lumentum reported Q1 on Monday, Nov 2 after the close: $4.57 a share in our data feed. On the same basis as the $3.82 estimate it was $3.76 (Nasdaq's figures), a miss of 2%.");
    // Nasdaq's figure not posted yet: the result alone, no verdict, no basis claim.
    expect(reportedLine("X", { date: "2026-11-02", session: "amc", quarter: 1, epsE: 3.82, epsA: 4.57, nA: null }, "2026-11-03", fmt)).toBe("X reported Q1 on Monday, Nov 2 after the close: $4.57 a share.");
  });
  it("judgeReaction shows the same-source pair in the history table", () => {
    expect(judgeReaction({ epsE: 3.82, epsA: 4.57, surprisePct: 19.6 }, null, false, 3.76)).toMatchObject({ epsE: 3.82, epsA: 3.76 });
    expect(judgeReaction({ epsE: 3.82, epsA: 4.57, surprisePct: 19.6 }, null, false, 3.76).surprisePct).toBeCloseTo(-1.57, 1);
  });
  it("the share title quotes the judged pair, and no pair while Nasdaq's figure is pending", () => {
    const just = { quarter: 1, epsE: 3.82, epsA: 4.57 };
    expect(tickerShareTitle("LITE", "LITE", null, { ...just, nA: 3.76 })).toBe("LITE reported Q1: $4.57 a share ($3.76 on the estimate's basis) vs $3.82 expected · Metaphases");
    expect(tickerShareTitle("LITE", "LITE", null, { ...just, nA: null })).toBe("LITE reported Q1: $4.57 a share · Metaphases");
    expect(tickerShareTitle("ZZZR", "ZZZR", null, { quarter: 3, epsE: 0.73, epsA: 0.87 })).toBe("ZZZR reported Q3: $0.87 a share vs $0.73 expected · Metaphases");
  });
  it("a pending pair leaves the history row unjudged without a basis flag (a REIT's estimate isn't hidden for it)", () => {
    const h = judgeReaction({ epsE: 3.82, epsA: 4.57, surprisePct: 19.6 }, null, true, null);
    expect(h).toMatchObject({ epsE: null, epsA: 4.57, surprisePct: null });
    expect(h.basis).toBeUndefined();
  });
  it("the share description quotes the pair on the estimate's basis", () => {
    const d = { next: null, justReported: { date: "2026-11-02", session: "amc", quarter: 1, year: 2027, epsE: 3.82, epsA: 4.57, nA: 3.76 }, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as unknown as TickerResponse;
    expect(tickerShareDesc("Lumentum", d)).toContain("$4.57 EPS ($3.76 on the estimate's basis) vs $3.82 expected");
  });
});

// ── Worker: the calendar row and The Read ───────────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  ttl = new Map<string, number>();
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); this.ttl.set(req.url, Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1])); }
  async delete(req: Request) { return this.store.delete(req.url); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let calRows: any[] = [];
let nqDayRows: any[] = [];
let surprises: any[] = [];
let nqSurprise: any[] = [];

beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: nqDayRows } }));
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const from = url.searchParams.get("from"), to = url.searchParams.get("to"), sym = url.searchParams.get("symbol");
      return new Response(JSON.stringify({ earningsCalendar: calRows.filter((r) => (!sym || r.symbol === sym) && (!from || r.date >= from) && (!to || r.date <= to)) }));
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

describe("worker (0058)", () => {
  it("/api/calendar: a pr:n row carries Nasdaq's actual and is judged on that pair", async () => {
    calRows = [{ symbol: "LITE", date: "2026-11-03", hour: "amc", quarter: 1, year: 2027, epsEstimate: 4.4, epsActual: 4.57, revenueEstimate: null, revenueActual: null }];
    nqDayRows = [{ symbol: "LITE", eps: "$3.76", epsForecast: "$3.82" }];
    const r = await get("/api/calendar?from=2026-11-03&to=2026-11-03");
    const lite = r.events.find((e: any) => e.s === "LITE");
    expect(lite).toMatchObject({ eA: 4.57, eE: 3.82, nA: 3.76, pr: "n" });
    expect(resultOf(lite)).toBe("miss");
  });

  it("/api/calendar: the day after a report Nasdaq hasn't posted actuals (no eps column): not judged yet, and asked again within the hour", async () => {
    calRows = [{ symbol: "LITE", date: "2026-11-11", hour: "amc", quarter: 1, year: 2027, epsEstimate: 4.4, epsActual: 4.57, revenueEstimate: null, revenueActual: null }];
    nqDayRows = [{ symbol: "LITE", epsForecast: "$3.82", lastYearEPS: "$1.00" }];
    const r = await get("/api/calendar?from=2026-11-11&to=2026-11-11");
    const lite = r.events.find((e: any) => e.s === "LITE");
    expect(lite).toMatchObject({ eA: 4.57, eE: 3.82, nA: null, pr: "n" });
    expect(resultOf(lite)).toBeNull();
    const cache = (globalThis as any).caches.default as MemCache;
    const key = [...cache.store.keys()].find((k) => k.includes("nq%3Acal%3Av2%3A2026-11-11"));
    expect(key).toBeTruthy();
    expect(cache.ttl.get(key!)).toBe(3600);
  });

  it("/api/ticker: The Read sets the next estimate against last quarter's actual on its own basis (AMD: never $2.95 vs $1.84)", async () => {
    calRows = [{ symbol: "AMD", date: "2027-02-02", hour: "amc", quarter: 4, year: 2026, epsEstimate: 2.95, epsActual: null, revenueEstimate: 11e9, revenueActual: null }];
    surprises = [{ period: "2026-09-30", quarter: 3, year: 2026, actual: 2.09, estimate: 1.94, surprisePercent: 7.7 }];
    nqSurprise = [{ fiscalQtrEnd: "Sep 2026", dateReported: "11/3/2026", eps: 1.84, consensusForecast: "1.68", percentageSurprise: "9.52" }];
    const r = await get("/api/ticker/AMD");
    const read = r.read.join(" ");
    expect(read).not.toContain("versus $1.84");
    expect(read).toContain("Wall Street expects $2.95 a share, versus $2.09 last quarter.");
    expect(r.history[0]).toMatchObject({ epsE: 1.68, epsA: 1.84 }); // the history table stays one source
  });
});
