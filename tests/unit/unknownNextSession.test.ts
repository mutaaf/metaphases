import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

// 0090: whenever the next report's session is unknown (a date-only company notice like Dell's, a blank feed time),
// and `symbol=` has already dropped the last dated report (the day after every print), the past reports' sessions
// came from nothing: every move read "—" and the typical move was null. An unknown next session says nothing about
// when the last four reports came out: the cached last report, Nasdaq, then the stock's own reaction test decide
// (at least 3 of 4), else unknown. The next row's own session stays "".

const REPORTS = ["2026-08-27", "2026-05-28", "2026-02-26", "2025-11-25"]; // newest first, all weekdays
// Dell, 0090's numbers: the day-after (after-close) move wins 4 of 4.
const AMC_DAY = [-6.8, 3.8, -1.6, -1.0], AMC_NEXT = [15.8, 32.8, 21.9, 5.8];
// 2–2 split: no answer.
const SPLIT_DAY = [5, 5, 1, 1], SPLIT_NEXT = [1, 1, 5, 5];

function closes(day: number[], next: number[]) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, bump: number | null = null;
  for (let t = Date.parse("2025-09-01T20:00:00Z"); t <= Date.parse("2026-11-18T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const i = REPORTS.indexOf(iso);
    if (bump != null) { px *= 1 + bump / 100; bump = null; }
    if (i >= 0) { px *= 1 + day[i] / 100; bump = next[i]; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { timestamp, close };
}

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 1.0, consensusForecast: "0.95", percentageSurprise: "5.26" }; });

function stub(sym: string, next: { date: string; hour: string }, chart: { timestamp: number[]; close: number[] }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: chart.timestamp, indicators: { quote: [{ open: chart.close, high: chart.close, low: chart.close, close: chart.close }] } }] } }));
    // symbol= is future-only: the last dated report is gone.
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [{ symbol: sym, date: next.date, hour: next.hour, quarter: 3, year: 2027, epsEstimate: 2.71, epsActual: null, revenueEstimate: 32e9, revenueActual: null }] }));
    return new Response("{}", { status: 404 });
  }));
}
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T16:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const past = (r: any) => r.history.filter((h: any) => REPORTS.includes(h.date));

describe("/api/ticker: an unknown next session never blanks the past (0090)", () => {
  it("DELL, company-dated with no session, no last report: past moves on the after-close day, typical move ≈ ±19%", async () => {
    stub("DELL", { date: "2026-11-24", hour: "" }, closes(AMC_DAY, AMC_NEXT));
    const r = await sheet("DELL");
    expect(r.next).toMatchObject({ date: "2026-11-24", session: "" });
    const p = past(r);
    expect(p).toHaveLength(4);
    p.forEach((h: any, i: number) => { expect(h.session).toBe("amc"); expect(h.move).toBeCloseTo(AMC_NEXT[i], 4); });
    expect(r.expectedMove).toBeGreaterThan(15);
    expect(r.expectedMove).toBeLessThan(23);
  });

  it("a blank feed time, no last report: the same reaction test decides", async () => {
    stub("ZZBL", { date: "2026-11-25", hour: "" }, closes(AMC_NEXT, AMC_DAY));
    const r = await sheet("ZZBL");
    expect(r.next).toMatchObject({ date: "2026-11-25", session: "" });
    const p = past(r);
    p.forEach((h: any, i: number) => { expect(h.session).toBe("bmo"); expect(h.move).toBeCloseTo(AMC_NEXT[i], 4); });
    expect(r.expectedMove).not.toBeNull();
  });

  it("the moves split 2–2: no guess, sessions stay unknown and no typical move", async () => {
    stub("ZZSP", { date: "2026-11-25", hour: "" }, closes(SPLIT_DAY, SPLIT_NEXT));
    const r = await sheet("ZZSP");
    expect(r.next.session).toBe("");
    past(r).forEach((h: any) => { expect(h.session).toBe(""); expect(h.move).toBeNull(); });
    expect(r.expectedMove).toBeNull();
  });

  it("the calendar's cached last report outranks the reaction test", async () => {
    stub("ZZCA", { date: "2026-11-25", hour: "" }, closes(AMC_DAY, AMC_NEXT));
    (globalThis as any).caches.default.store.set(`https://cache.metaphases.internal/${encodeURIComponent("cal:v3:2026-11-18")}`,
      JSON.stringify([{ s: "ZZCA", d: "2026-11-18", h: "bmo", q: 2, y: 2027, eE: 1, eA: 1.1, rE: 1e9, rA: 1.1e9 }]));
    const r = await sheet("ZZCA");
    past(r).forEach((h: any) => expect(h.session).toBe("bmo"));
  });
});

describe("0090: a date-only company date's raw feed session is no evidence", () => {
  it("HP the day after its Nov 19 call: the cached feed row's amc is ignored, the stock's own moves (bmo) decide", async () => {
    vi.setSystemTime(new Date("2026-11-20T16:00:00Z"));
    stub("HP", { date: "2027-02-04", hour: "" }, closes(AMC_NEXT, AMC_DAY));
    (globalThis as any).caches.default.store.set(`https://cache.metaphases.internal/${encodeURIComponent("cal:v3:2026-11-19")}`,
      JSON.stringify([{ s: "HP", d: "2026-11-19", h: "amc", q: 4, y: 2026, eE: 0.27, eA: 0.3, rE: 1.1e9, rA: 1.1e9 }]));
    const r = await sheet("HP");
    past(r).forEach((h: any, i: number) => { expect(h.session).toBe("bmo"); expect(h.move).toBeCloseTo(AMC_NEXT[i], 4); });
  });
});
