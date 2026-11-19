import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { justResult } from "../../shared/reported";
import { tickerShareTitle } from "../../shared/pending";

// 0087: a just-reported company whose same-source pair isn't in yet says why it isn't graded, and the sheet, its
// history row and the unfurl quote the estimate the calendar judges with (Nasdaq's pre-report $2.05 for Target,
// $1.33 for TJX), never Finnhub's figure revised after the print ($2.09, $1.3513: TJX read "missed by 1%").

describe("justResult: the sheet's Result cell (0087)", () => {
  it("Nasdaq's same-basis actual isn't posted yet: a reason, never a bare dash", () => {
    const r = justResult({ epsA: 2.65, epsE: 2.05, nA: null });
    expect(r.text).toBe("Not graded yet");
    expect(r.why).toMatch(/waiting for a second source/i);
    expect(r.text).not.toBe("—");
  });
  it("an actual with no estimate says so", () => {
    expect(justResult({ epsA: 2.65, epsE: null }).text).toBe("No estimate to compare");
  });
  it("no actual yet, and a judged pair, read as before", () => {
    expect(justResult({ epsA: null, epsE: 2.05 }).text).toBe("Figures not in yet");
    expect(justResult({ epsA: 3.57, epsE: 3.36 }).text).toBe("Beat by 6%");
    expect(justResult({ epsA: 3.57, epsE: 3.36 }).why).toBeUndefined();
  });
  it("the share title says it isn't graded yet and quotes no other estimate", () => {
    expect(tickerShareTitle("TGT", "Target", null, { quarter: 3, epsE: 2.05, epsA: 2.65, nA: null })).toBe("TGT reported Q3: $2.65 a share, not graded yet · Metaphases");
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
  async delete(req: Request) { return this.store.delete(req.url); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let nasdaqDown = false;
// Finnhub's estimate as revised after the print; Nasdaq's pre-report consensus; Nasdaq hasn't posted its actual.
const calRows = [
  { symbol: "TJX", date: "2026-11-18", hour: "bmo", quarter: 3, year: 2027, epsEstimate: 1.3513, epsActual: 1.34, revenueEstimate: 15997206240, revenueActual: 15952000000 },
  { symbol: "TJX", date: "2027-02-24", hour: "bmo", quarter: 4, year: 2027, epsEstimate: 1.42, epsActual: null, revenueEstimate: 17e9, revenueActual: null },
];
const nqDayRows = [{ symbol: "TJX", epsForecast: "$1.33", lastYearEPS: "$1.28" }];
const nqSurprise = [
  { fiscalQtrEnd: "Jul 2026", dateReported: "8/19/2026", eps: 1.2, consensusForecast: "1.12", percentageSurprise: "7.14" },
  { fiscalQtrEnd: "Apr 2026", dateReported: "5/20/2026", eps: 1.1, consensusForecast: "1.05", percentageSurprise: "4.76" },
];

beforeEach(() => {
  waits = [];
  nasdaqDown = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return nasdaqDown ? new Response("down", { status: 503 }) : new Response(JSON.stringify({ data: { rows: url.searchParams.get("date") === "2026-11-18" ? nqDayRows : [] } }));
    if (url.hostname === "api.nasdaq.com" && url.pathname.endsWith("/earnings-surprise")) return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqSurprise } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const from = url.searchParams.get("from"), to = url.searchParams.get("to"), sym = url.searchParams.get("symbol");
      return new Response(JSON.stringify({ earningsCalendar: calRows.filter((r) => (!sym || r.symbol === sym) && (!from || r.date >= from) && (!to || r.date <= to)) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r;
};
const json = async (path: string) => (await get(path)).json() as Promise<any>;
// The worker's /t/:sym og:title is tickerShareTitle over the same sheet data.
const titleOf = (t: any) => tickerShareTitle(t.symbol, t.symbol, t.next, t.justReported);

function expectOneEstimate(t: any, title: string | undefined) {
  expect(t.justReported).toMatchObject({ epsA: 1.34, epsE: 1.33, nA: null });
  // The history row for the same report: Nasdaq's pre-report bar, unjudged (0058), never Finnhub's revised 1.3513.
  const h = t.history.find((x: any) => x.date === "2026-11-18");
  expect(h).toBeTruthy();
  expect(h.epsE).not.toBe(1.3513);
  expect(h.surprisePct).toBeNull();
  expect(JSON.stringify(t)).not.toContain("1.3513");
  expect(title).toBe("TJX reported Q3: $1.34 a share, not graded yet · Metaphases");
  expect(t.read[0]).toContain("$1.34 a share against $1.33 expected. It isn't graded yet");
}

describe("worker: one estimate for a just-reported row (0087)", () => {
  it("report day, cold colo (an unfurl): the sheet and its title use Nasdaq's pre-report bar, as the calendar does", async () => {
    vi.setSystemTime(new Date("2026-11-18T16:00:00Z"));
    const t = await json("/api/ticker/TJX");
    const cal = (await json("/api/calendar?from=2026-11-18&to=2026-11-18")).events.find((e: any) => e.s === "TJX");
    expect(cal).toMatchObject({ eE: 1.33, pr: "n", nA: null });
    expectOneEstimate(t, titleOf(t));
  });

  it("the day after, from a day cached while Nasdaq was down: the sheet re-judges the row instead of grading the revised estimate", async () => {
    vi.setSystemTime(new Date("2026-11-18T16:00:00Z"));
    nasdaqDown = true;
    await json("/api/calendar?from=2026-11-16&to=2026-11-20");
    nasdaqDown = false;
    vi.setSystemTime(new Date("2026-11-19T15:00:00Z"));
    const t = await json("/api/ticker/TJX");
    expectOneEstimate(t, titleOf(t));
  });

  it("Nasdaq unreachable for the sheet too: the row stays as the calendar has it (no crash)", async () => {
    vi.setSystemTime(new Date("2026-11-18T16:00:00Z"));
    nasdaqDown = true;
    const t = await json("/api/ticker/TJX");
    expect(t.justReported).toMatchObject({ epsA: 1.34 });
  });

  it("a report older than the just-reported window keeps its history row, on the pre-report bar", async () => {
    vi.setSystemTime(new Date("2026-11-18T16:00:00Z"));
    await json("/api/calendar?from=2026-11-16&to=2026-11-20");
    vi.setSystemTime(new Date("2026-11-25T15:00:00Z"));
    const t = await json("/api/ticker/TJX");
    expect(t.justReported).toBeUndefined();
    const h = t.history.find((x: any) => x.date === "2026-11-18");
    expect(h).toMatchObject({ epsA: 1.34, surprisePct: null });
    expect(h.epsE).not.toBe(1.3513);
  });
});
