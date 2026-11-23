import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { ADS_SHARES, adsScale, onAdsBasis } from "../../shared/adsBasis";
import { companyCurrencyPairs } from "../../shared/adrPairs";
import type { Reaction } from "../../shared/types";

// 0103: the critic's 2026-11-23 07:00 check. JD's Nov 17 calendar row was rewritten overnight from per ADS
// (CN¥4.5237 → 5.86608) to per ordinary share (CN¥3.0175 → 2.94; 1 ADS = 2 shares). JD headlines RMB 5.88 per ADS,
// and Nasdaq's dollar pair ($0.89 → $0.77) is per ADS. Yahoo's CNY=X: 6.71 at the quarter's end.
// Controls, live Nasdaq pairs on 2026-11-23 against the calendar's per-ADS rows:
//   BIDU 6.4888 → 6.78 vs $0.57 → $0.58 · NTES 16.4312 → 14.21 vs $2.37 → $1.94 · TME 1.5022 → 1.55 vs $0.21 → $0.21
//   PDD 19.213 → 21.04 vs $2.61 → $2.99 · BABA 11.3861 → 8.10 vs $1.56 → $1.04 · XPEV −0.9066 → −0.91 vs N/A → −$0.14

const jdShare = { eE: 3.0175, eA: 2.94 };
const jdNq = { est: 0.89, eps: 0.77 };

describe("adsScale (0103)", () => {
  it("JD per ordinary share → per ADS: CN¥6.035 → CN¥5.88", () => {
    expect(adsScale("JD", jdShare, jdNq, 6.71)).toBe(2);
    const r = onAdsBasis("JD", { s: "JD", d: "2026-11-17", ...jdShare }, jdNq, 6.71);
    expect(r.eE).toBeCloseTo(6.035, 6);
    expect(r.eA).toBeCloseTo(5.88, 6);
    expect(r.s).toBe("JD");
  });
  it("JD already per ADS (yesterday's CN¥4.52 → 5.87) is left alone", () => {
    expect(adsScale("JD", { eE: 4.5237, eA: 5.86608 }, jdNq, 6.71)).toBe(1);
  });
  it("every other ADR's per-ADS row is unchanged (live controls)", () => {
    expect(adsScale("BIDU", { eE: 6.4888, eA: 6.78 }, { est: 0.57, eps: 0.58 }, 6.71)).toBe(1);
    expect(adsScale("NTES", { eE: 16.4312, eA: 14.21 }, { est: 2.37, eps: 1.94 }, 6.71)).toBe(1);
    expect(adsScale("TME", { eE: 1.5022, eA: 1.55 }, { est: 0.21, eps: 0.21 }, 6.71)).toBe(1);
    expect(adsScale("PDD", { eE: 19.213, eA: 21.04 }, { est: 2.61, eps: 2.99 }, 6.71)).toBe(1);
    expect(adsScale("BABA", { eE: 11.3861, eA: 8.1 }, { est: 1.56, eps: 1.04 }, 6.71)).toBe(1);
    expect(adsScale("XPEV", { eE: -0.9066, eA: -0.91 }, { est: null, eps: -0.14 }, 6.71)).toBe(1);
  });
  it("no guessing: no Nasdaq actual or estimate, no rate, a dollar row, an untabled name: unchanged", () => {
    expect(adsScale("JD", jdShare, { est: 0.89, eps: null }, 6.71)).toBe(1);
    expect(adsScale("JD", jdShare, { est: null, eps: 0.77 }, 6.71)).toBe(1);
    expect(adsScale("JD", jdShare, null, 6.71)).toBe(1);
    expect(adsScale("JD", jdShare, jdNq, null)).toBe(1);
    expect(adsScale("JD", { ...jdShare, ec: "USD" }, jdNq, 6.71)).toBe(1);
    expect(adsScale("JD", { eE: 3.0175, eA: null }, jdNq, 6.71)).toBe(1);
    expect(adsScale("NIO", jdShare, jdNq, 6.71)).toBe(1);
    expect(adsScale("TM", jdShare, jdNq, 6.71)).toBe(1); // Toyota headlines per share: never scaled
  });
  it("the two signals must agree: the actual alone, or a sign flip, doesn't scale", () => {
    // Estimate per ADS, actual per share (a half-rewritten row): the estimate says no.
    expect(adsScale("JD", { eE: 4.5237, eA: 2.94 }, jdNq, 6.71)).toBe(1);
    expect(adsScale("JD", { eE: 3.0175, eA: -2.94 }, jdNq, 6.71)).toBe(1);
    // Scaled, but still far from Nasdaq (more than 1.5×): not shown as the ADS figure.
    expect(adsScale("JD", { eE: 1, eA: 1 }, jdNq, 6.71)).toBe(1);
  });
  it("the table is whole numbers of shares, 2 or more", () => {
    for (const n of Object.values(ADS_SHARES)) expect(Number.isInteger(n) && n >= 2).toBe(true);
    expect(ADS_SHARES.JD).toBe(2);
  });
});

const rx = (date: string, period: string, epsE: number | null, epsA: number | null): Reaction =>
  ({ date, session: "bmo", period, epsE, epsA, surprisePct: epsE != null && epsA != null ? ((epsA - epsE) / Math.abs(epsE)) * 100 : null, move: 1 });

describe("companyCurrencyPairs with the symbol (0103)", () => {
  it("JD's per-share calendar pair is shown per ADS on the sheet: CN¥6.035 → CN¥5.88, −2.6%", () => {
    const out = companyCurrencyPairs([rx("2026-11-17", "Sep 2026", 0.89, 0.77), rx("2026-08-13", "Jun 2026", 0.77, 0.83)], { d: "2026-11-17", ...jdShare }, "CNY", 6.71, (h) => h, "JD");
    expect(out[0].epsE).toBeCloseTo(6.035, 6);
    expect(out[0].epsA).toBeCloseTo(5.88, 6);
    expect(out[0].surprisePct!).toBeCloseTo(-2.57, 1);
    expect(out[0].cur).toBe("CNY");
  });
  it("PDD's per-ADS pair is unchanged with or without the symbol", () => {
    const h = [rx("2026-11-19", "Sep 2026", 2.61, 2.99)];
    const a = companyCurrencyPairs(h, { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", 6.71, (x) => x, "PDD");
    const b = companyCurrencyPairs(h, { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", 6.71, (x) => x);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ epsE: 19.213, epsA: 21.04 });
  });
});

// ── Worker: the calendar row and the sheet agree ─────────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
  async delete(req: Request) { return this.store.delete(req.url); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let nqSurprise: Record<string, any[]> = {};
let calRows: any[] = [];
const ts = (d: string) => Date.parse(d + "T04:00:00Z") / 1000;
const calDay = (day: string, rows: any[]) => (globalThis as any).caches.default.store.set(`https://cache.metaphases.internal/${encodeURIComponent(`cal:v3:${day}`)}`, JSON.stringify(rows));
const nqRow = (fiscalQtrEnd: string, dateReported: string, eps: number, consensusForecast: string) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: "0" });

beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) {
      const sym = url.pathname.split("/")[3];
      return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise[sym] ?? [] } } }));
    }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { rows: null } }));
    if (url.hostname.endsWith("finance.yahoo.com")) {
      const fx = url.pathname.includes("CNY");
      const days = fx ? ["2026-09-29", "2026-09-30", "2026-10-05"] : ["2026-11-16", "2026-11-17", "2026-11-18"];
      const close = fx ? [6.71, 6.71, 6.7045] : [30, 28, 28];
      return new Response(JSON.stringify({ chart: { result: [{ timestamp: days.map(ts), indicators: { quote: [{ open: close, high: close, low: close, close }] } }] } }));
    }
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      return new Response(JSON.stringify({ earningsCalendar: calRows.filter((r) => !sym || r.symbol === sym) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};

describe("worker (0103)", () => {
  it("/api/calendar: JD's row from the Hong Kong line (9618.HK, per share) reads CN¥6.035 → CN¥5.88; BIDU's is unchanged", async () => {
    calRows = [
      { symbol: "9618.HK", date: "2026-11-17", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 3.0175, epsActual: 2.94, revenueEstimate: 3.0e11, revenueActual: 2.99e11 },
      { symbol: "BIDU", date: "2026-11-16", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 6.4888, epsActual: 6.78, revenueEstimate: 3.1e10, revenueActual: 3.08e10 },
    ];
    nqSurprise = { JD: [nqRow("Sep 2026", "11/17/2026", 0.77, "0.89")], BIDU: [nqRow("Sep 2026", "11/16/2026", 0.58, "0.57")] };
    const r = await get("/api/calendar?from=2026-11-16&to=2026-11-20");
    const jd = r.events.find((e: any) => e.s === "JD");
    expect(jd).toBeTruthy();
    expect(jd.eE).toBeCloseTo(6.035, 6);
    expect(jd.eA).toBeCloseTo(5.88, 6);
    const bidu = r.events.find((e: any) => e.s === "BIDU");
    expect(bidu).toMatchObject({ eE: 6.4888, eA: 6.78 });
  });

  it("/api/calendar: no Nasdaq pair for JD, the row is left as the feed gave it (no guessing)", async () => {
    calRows = [{ symbol: "9618.HK", date: "2026-11-17", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 3.0175, epsActual: 2.94 }];
    nqSurprise = {};
    const r = await get("/api/calendar?from=2026-11-16&to=2026-11-20");
    expect(r.events.find((e: any) => e.s === "JD")).toMatchObject({ eE: 3.0175, eA: 2.94 });
  });

  it("/api/ticker/JD: the per-share cached calendar row shows per ADS, the same pair as the calendar", async () => {
    calRows = [];
    nqSurprise = { JD: [nqRow("Sep 2026", "11/17/2026", 0.77, "0.89"), nqRow("Jun 2026", "8/13/2026", 0.83, "0.77")] };
    calDay("2026-11-17", [{ s: "JD", d: "2026-11-17", h: "bmo", q: 3, y: 2026, eE: 3.0175, eA: 2.94, t: 1 }]);
    const r = await get("/api/ticker/JD");
    expect(r.history[0].cur).toBe("CNY");
    expect(r.history[0].epsE).toBeCloseTo(6.035, 6);
    expect(r.history[0].epsA).toBeCloseTo(5.88, 6);
    expect(r.history[0].surprisePct).toBeCloseTo(-2.57, 1);
  });
});
