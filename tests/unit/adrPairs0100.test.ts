import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { ADR_FX_MAX, companyCurrencyPairs, nasdaqMatchesCompany, periodEnd, sameReportRow } from "../../shared/adrPairs";
import type { Reaction } from "../../shared/types";

// 0100: the critic's 2026-11-22 07:00 check. The calendar row carries the feed's own-currency pair, which matches the
// company's release; the sheet read Nasdaq's dollar pair, 5–15% off the company's own translation.
//   PDD Nov 19: calendar CN¥19.213 → CN¥21.04 (+9.5%); Nasdaq $2.61 → $2.99 (+14.6%); company RMB 21.04 = US$3.14.
//   BABA Nov 19: calendar CN¥11.3861 → CN¥8.10 (−28.9%); Nasdaq $1.56 → $1.04 (−33.3%); company RMB 8.10 = US$1.21.
//   JD Nov 17: calendar CN¥4.5237 → CN¥5.86608 (a beat); Nasdaq $0.89 → $0.77 (a miss); company RMB 5.88 = US$0.88.
// Yahoo's CNY=X closed 6.7111 on Sep 23 and 6.7045 on Oct 5; PDD's own rate was 21.04 / 3.14 = 6.70.

const rx = (date: string, period: string, epsE: number | null, epsA: number | null, move: number | null = 1): Reaction =>
  ({ date, session: "bmo", period, epsE, epsA, surprisePct: epsE != null && epsA != null ? ((epsA - epsE) / Math.abs(epsE)) * 100 : null, move });
const pddNq = () => [rx("2026-11-19", "Sep 2026", 2.61, 2.99, 11.04), rx("2026-08-24", "Jun 2026", 2.69, 2.72), rx("2026-05-27", "Mar 2026", 2.03, 1.23), rx("2026-03-25", "Dec 2025", 3.21, 2.36)];
const judge = (h: Reaction) => h;

describe("companyCurrencyPairs (0100)", () => {
  it("PDD: the Nov 19 row is the calendar's CN¥19.21 → CN¥21.04, +9.5%, and the move stays the dollar share's", () => {
    const out = companyCurrencyPairs(pddNq(), { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", 6.71, judge);
    expect(out[0]).toMatchObject({ date: "2026-11-19", epsE: 19.213, epsA: 21.04, cur: "CNY", move: 11.04 });
    expect(out[0].surprisePct!).toBeCloseTo(9.5, 1);
    expect(out[0].basis).toBeUndefined();
  });
  it("PDD: Nasdaq's $2.99 is 4.7% off the company's US$3.14, so its older dollar pairs are 'basis differs'", () => {
    const out = companyCurrencyPairs(pddNq(), { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", 6.71, judge);
    expect(out.slice(1).every((h) => h.basis === "differs" && h.surprisePct == null && !h.cur)).toBe(true);
    expect(out.slice(1).map((h) => h.epsA)).toEqual([2.72, 1.23, 2.36]); // still shown, just not judged
  });
  it("BABA: CN¥11.39 → CN¥8.10, −28.9%, never Nasdaq's −33.3%", () => {
    const baba = [rx("2026-11-19", "Sep 2026", 1.56, 1.04), rx("2026-08-20", "Jun 2026", 1.78, 1.01)];
    const out = companyCurrencyPairs(baba, { d: "2026-11-19", eE: 11.3861, eA: 8.1 }, "CNY", 6.71, judge);
    expect(out[0]).toMatchObject({ epsE: 11.3861, epsA: 8.1, cur: "CNY" });
    expect(out[0].surprisePct!).toBeCloseTo(-28.9, 1);
    expect(out[1].basis).toBe("differs");
  });
  it("JD: the feed's day is one off (calendar Nov 17 beat, Nasdaq row Nov 18): the verdict is the calendar's beat", () => {
    const jd = [rx("2026-11-18", "Sep 2026", 0.89, 0.77), rx("2026-08-13", "Jun 2026", 0.77, 0.83)];
    const out = companyCurrencyPairs(jd, { d: "2026-11-17", eE: 4.5237, eA: 5.86608 }, "CNY", 6.71, judge);
    expect(out[0].epsA! >= out[0].epsE!).toBe(true);
    expect(out[0].cur).toBe("CNY");
  });
  it("Nasdaq within 3% of the company's figure in dollars: its older pairs keep counting", () => {
    const nq = pddNq(); nq[0].epsA = 3.12; // 21.04 / 6.71 = 3.136
    const out = companyCurrencyPairs(nq, { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", 6.71, judge);
    expect(out.slice(1).some((h) => h.basis)).toBe(false);
    expect(out.slice(1)).toEqual(nq.slice(1));
  });
  it("no rate: nothing is shown to agree, so older pairs aren't counted (fail closed)", () => {
    const out = companyCurrencyPairs(pddNq(), { d: "2026-11-19", eE: 19.213, eA: 21.04 }, "CNY", null, judge);
    expect(out.slice(1).every((h) => h.basis === "differs")).toBe(true);
  });
  it("cold cache, a calendar row in dollars (0097's Nasdaq pair), a far-off day, or no figures: unchanged", () => {
    const nq = pddNq();
    expect(companyCurrencyPairs(nq, null, "CNY", 6.71, judge)).toBe(nq);
    expect(companyCurrencyPairs(nq, { d: "2026-11-19", eE: 2.61, eA: 2.99, ec: "USD" }, "CNY", 6.71, judge)).toBe(nq);
    expect(companyCurrencyPairs(nq, { d: "2026-11-24", eE: 19.2, eA: 21 }, "CNY", 6.71, judge)).toBe(nq);
    expect(companyCurrencyPairs(nq, { d: "2026-11-19", eE: 19.2, eA: null }, "CNY", 6.71, judge)).toBe(nq);
  });
  it("helpers: period end, same-report window, the 3% band", () => {
    expect(periodEnd("Sep 2026")).toBe("2026-09-30");
    expect(periodEnd("Feb 2028")).toBe("2028-02-29");
    expect(periodEnd("Q3 2026")).toBeNull();
    expect(sameReportRow([{ date: "Q3 2026" }, { date: "2026-11-18" }], "2026-11-19")).toBe(1);
    expect(sameReportRow([{ date: "2026-11-21" }], "2026-11-19")).toBe(-1);
    expect(ADR_FX_MAX).toBe(0.03);
    expect(nasdaqMatchesCompany(2.99, 21.04, 6.7)).toBe(false); // 4.8% off
    expect(nasdaqMatchesCompany(1.04, 8.1, 6.71)).toBe(false); // 13.8% off
    expect(nasdaqMatchesCompany(3.1, 21.04, 6.7)).toBe(true);
    expect(nasdaqMatchesCompany(-3.1, 21.04, 6.7)).toBe(false);
  });
});

// ── Worker: the sheet ─────────────────────────────────────────────────────
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
let calRows: any[] = [];
const yahooHits: string[] = [];
const ts = (d: string) => Date.parse(d + "T04:00:00Z") / 1000;
const calDay = (day: string, rows: any[]) => (globalThis as any).caches.default.store.set(`https://cache.metaphases.internal/${encodeURIComponent(`cal:v3:${day}`)}`, JSON.stringify(rows));

beforeEach(() => {
  waits = []; yahooHits.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise } } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { rows: null } }));
    if (url.hostname.endsWith("finance.yahoo.com")) {
      yahooHits.push(decodeURIComponent(url.pathname));
      const fx = url.pathname.includes("CNY");
      const days = fx ? ["2026-09-23", "2026-09-30", "2026-10-05"] : ["2026-11-18", "2026-11-19", "2026-11-20"];
      const close = fx ? [6.7111, 6.7102, 6.7045] : [100, 111, 112];
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
const row = (fiscalQtrEnd: string, dateReported: string, eps: number, consensusForecast: string) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: "0" });
const pddRows = () => [row("Sep 2026", "11/19/2026", 2.99, "2.61"), row("Jun 2026", "8/24/2026", 2.72, "2.69"), row("Mar 2026", "5/27/2026", 1.23, "2.03"), row("Dec 2025", "3/25/2026", 2.36, "3.21")];

describe("worker /api/ticker: an ADR's newest report matches the calendar (0100)", () => {
  it("PDD: the sheet's Nov 19 row is the calendar's CN¥ pair, older dollar pairs are out of the record", async () => {
    calRows = [];
    nqSurprise = pddRows();
    calDay("2026-11-19", [{ s: "PDD", d: "2026-11-19", h: "bmo", q: 3, y: 2026, eE: 19.213, eA: 21.04, rE: 117133197205, rA: 108341000000, t: 1 }]);
    const r = await get("/api/ticker/PDD");
    expect(r.history[0]).toMatchObject({ date: "2026-11-19", epsE: 19.213, epsA: 21.04, cur: "CNY" });
    expect(r.history[0].surprisePct).toBeCloseTo(9.5, 1);
    expect(r.history.slice(1).every((h: any) => h.basis === "differs" && !h.cur)).toBe(true);
    expect(r.beatRate).toEqual({ beats: 1, total: 1 });
    expect(yahooHits.some((p) => p.includes("CNY=X"))).toBe(true);
  });

  it("JD: the calendar's beat, never Nasdaq's $0.89 → $0.77 miss", async () => {
    calRows = [];
    nqSurprise = [row("Sep 2026", "11/17/2026", 0.77, "0.89"), row("Jun 2026", "8/13/2026", 0.83, "0.77")];
    calDay("2026-11-17", [{ s: "JD", d: "2026-11-17", h: "bmo", q: 3, y: 2026, eE: 4.5237, eA: 5.86608, t: 1 }]);
    const r = await get("/api/ticker/JD");
    expect(r.history[0]).toMatchObject({ epsE: 4.5237, epsA: 5.86608, cur: "CNY" });
    expect(r.history[0].surprisePct).toBeGreaterThan(0);
    expect(r.beatRate).toEqual({ beats: 1, total: 1 });
  });

  it("cold calendar cache: Nasdaq's dollar pair stays, unlabelled (the sheet says the table is in dollars)", async () => {
    calRows = [];
    nqSurprise = pddRows();
    const r = await get("/api/ticker/PDD");
    expect(r.history[0]).toMatchObject({ epsE: 2.61, epsA: 2.99 });
    expect(r.history.some((h: any) => h.cur)).toBe(false);
  });

  it("a dollar reporter (NVDA) is unchanged, and no exchange rate is read", async () => {
    calRows = [];
    nqSurprise = [row("Oct 2026", "11/18/2026", 1.3, "1.25"), row("Jul 2026", "8/26/2026", 1.05, "1.01")];
    calDay("2026-11-18", [{ s: "NVDA", d: "2026-11-18", h: "amc", q: 3, y: 2027, eE: 1.25, eA: 1.3, t: 1 }]);
    const r = await get("/api/ticker/NVDA");
    expect(r.history.some((h: any) => h.cur || h.basis)).toBe(false);
    expect(r.history[0]).toMatchObject({ epsE: 1.25, epsA: 1.3 });
    expect(yahooHits.some((p) => p.includes("=X"))).toBe(false);
  });
});

describe("AI facts (0100)", () => {
  it("a row in the company's currency is quoted in it, never as dollars", async () => {
    const { factsFor } = await import("../../worker/ai/prompts");
    const f = factsFor("ticker", { symbol: "PDD", history: [{ date: "2026-11-19", period: "Sep 2026", epsE: 19.213, epsA: 21.04, surprisePct: 9.5, move: 11, cur: "CNY" }, { date: "2026-08-24", period: "Jun 2026", epsE: 2.69, epsA: 2.72, surprisePct: 1.1, move: -1.5 }] }).join("\n");
    expect(f).toContain("EPS est CN¥19.21 vs actual CN¥21.04 (in the company's reporting currency");
    expect(f).toContain("EPS est $2.69 vs actual $2.72,");
  });
});
