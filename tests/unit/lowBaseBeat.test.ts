import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { EPS_SAME_SOURCE_GAP, epsVerdict, judgeReaction } from "../../shared/compare";

// 0094: a turnaround or low-base quarter in Nasdaq's own table (estimate and actual from the same source) is a
// beat or a miss, not "basis differs". Rows from the critic's 2026-11-20 07:00 sweep of Nov 20 – Dec 3 sheets.

describe("epsVerdict: Nasdaq's own pair with a small or negative base (0094)", () => {
  const same = { same: "nasdaq" as const };
  it("KSS Nov '25: −$0.19 → $0.10 is a beat, with no percentage of a negative base", () => {
    expect(epsVerdict({ eE: -0.19, eA: 0.1, ...same })).toMatchObject({ v: "beat", pct: null });
  });
  it("KSS Aug '26: $0.55 → $1.28 is a beat (+133%)", () => {
    const j = epsVerdict({ eE: 0.55, eA: 1.28, ...same });
    expect(j.v).toBe("beat");
    expect(j.pct).toBeCloseTo(132.7, 1);
  });
  it("ASAN May '26: a narrower loss (−$0.14 → −$0.06) is a beat", () => {
    expect(epsVerdict({ eE: -0.14, eA: -0.06, ...same }).v).toBe("beat");
  });
  it("M: −$0.13 → $0.09 and $0.02 → $0.13 are beats, no percentage of a near-zero base", () => {
    expect(epsVerdict({ eE: -0.13, eA: 0.09, ...same })).toMatchObject({ v: "beat", pct: null });
    expect(epsVerdict({ eE: 0.02, eA: 0.13, ...same })).toMatchObject({ v: "beat", pct: null });
    expect(epsVerdict({ eE: 0.21, eA: 0.79, ...same })).toMatchObject({ v: "beat", pct: null }); // AEO: base under 30¢
  });
  it("a widening loss from Nasdaq's own pair is a miss (BF.B $0.33 → $0.12 is in band-adjacent territory too)", () => {
    expect(epsVerdict({ eE: 0.33, eA: 0.12, ...same }).v).toBe("miss");
    expect(epsVerdict({ eE: 0.04, eA: -0.31, ...same })).toMatchObject({ v: "miss", pct: null });
  });
  it("a gap of a dollar or more stays 'basis differs', even from one source (CRM $2.35 → $4.95, WDAY $1.26 → $2.58)", () => {
    expect(epsVerdict({ eE: 2.35, eA: 4.95, ...same }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 1.26, eA: 2.58, ...same }).v).toBe("not-comparable");
    expect(EPS_SAME_SOURCE_GAP).toBeLessThanOrEqual(1);
  });
  it("cross-feed pairs keep the band: UBER, CPT, TM, and the RIOT/LYFT sign flips", () => {
    expect(epsVerdict({ eE: 0.9838, eA: 0.25, nE: 0.94 }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 0.5319, eA: 1.71 }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 64.4986, eA: 649.358 }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: -0.34, eA: 0.01 }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 0.22, eA: -0.03 }).v).toBe("not-comparable");
  });
  it("a REIT keeps its stricter rule even from one source (UDR $0.14 → $0.65, PSA $2.42 → $4.34)", () => {
    expect(epsVerdict({ eE: 0.14, eA: 0.65, reit: true, ...same }).v).toBe("not-comparable");
    expect(epsVerdict({ eE: 2.4173, eA: 4.34, reit: true, ...same }).v).toBe("not-comparable");
  });
  it("judgeReaction: a same-source turnaround row keeps its figures, loses only the percentage", () => {
    const h = judgeReaction({ epsE: -0.19, epsA: 0.1, surprisePct: 152.6 }, -0.19, false, undefined, true);
    expect(h).toMatchObject({ epsE: -0.19, epsA: 0.1, surprisePct: null });
    expect(h.basis).toBeUndefined();
    expect(judgeReaction({ epsE: -0.19, epsA: 0.1, surprisePct: 152.6 }, -0.19, false).basis).toBe("differs");
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

beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise } } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [] }));
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

describe("worker /api/ticker (0094)", () => {
  it("KSS: Nasdaq's own four quarters are 4 of 4 beats, none 'basis differs'", async () => {
    surprises = [];
    nqSurprise = [
      { fiscalQtrEnd: "Jul 2026", dateReported: "8/26/2026", eps: 1.28, consensusForecast: "0.55", percentageSurprise: "132.73" },
      { fiscalQtrEnd: "Apr 2026", dateReported: "5/28/2026", eps: -0.13, consensusForecast: "-0.18", percentageSurprise: "27.78" },
      { fiscalQtrEnd: "Jan 2026", dateReported: "3/10/2026", eps: 1.07, consensusForecast: "0.85", percentageSurprise: "25.88" },
      { fiscalQtrEnd: "Oct 2025", dateReported: "11/25/2025", eps: 0.1, consensusForecast: "-0.19", percentageSurprise: "152.63" },
    ];
    const r = await get("/api/ticker/KSS");
    expect(r.history.filter((h: any) => h.basis)).toEqual([]);
    expect(r.beatRate).toEqual({ beats: 4, total: 4 });
    const nov = r.history.find((h: any) => h.date === "2025-11-25");
    expect(nov).toMatchObject({ epsE: -0.19, epsA: 0.1, surprisePct: null });
  });

  it("CRM: Nasdaq's own $2.35 → $4.95 still reads 'basis differs' and stays out of the record", async () => {
    surprises = [];
    nqSurprise = [
      { fiscalQtrEnd: "Jul 2026", dateReported: "8/26/2026", eps: 4.95, consensusForecast: "2.35", percentageSurprise: "110.64" },
      { fiscalQtrEnd: "Apr 2026", dateReported: "5/27/2026", eps: 3.05, consensusForecast: "2.3", percentageSurprise: "32.61" },
    ];
    const r = await get("/api/ticker/CRM");
    expect(r.history.find((h: any) => h.date === "2026-08-26").basis).toBe("differs");
    expect(r.beatRate).toEqual({ beats: 1, total: 1 });
  });

  it("a Finnhub figure for the quarter makes it a cross-feed pair: the band still applies", async () => {
    surprises = [{ period: "2025-11-30", quarter: 3, year: 2025, actual: -1.52, estimate: -0.5757, surprisePercent: -164 }];
    nqSurprise = [{ fiscalQtrEnd: "Nov 2025", dateReported: "12/5/2025", eps: -0.52, consensusForecast: "-0.25", percentageSurprise: "-108" }];
    const r = await get("/api/ticker/CLSK");
    expect(r.history[0].basis).toBe("differs");
  });
});
