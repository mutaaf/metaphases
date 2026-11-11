import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 0057 self-review: a company-dated report (date override) that names no session stays "session unknown" for
// its move too, even when the feed has a session for the next quarter (LESSONS 2026-11-10). Made-up symbols
// and a mocked overrides file, so the test doesn't depend on live entries.
vi.mock("../../data/date-overrides.json", () => ({
  default: { ZZZQ: { date: "2026-11-12", quarter: 3, year: 2026, source: "https://example.com/8k", checked: "2026-11-10" } },
}));
const { default: worker } = await import("../../worker/index");

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;

/** Weekday closes at 100, with a +6% gap on `gap` and 105 the day after. */
function chart(gap: string) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, after = false;
  for (let t = Date.parse("2026-06-01T20:00:00Z"); t <= Date.parse("2026-11-13T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const day = d.toISOString().slice(0, 10);
    if (day === gap) { px = 106; after = true; } else if (after) { px = 105; after = false; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { chart: { result: [{ timestamp, indicators: { quote: [{ open: close, high: close, low: close, close }] } }] } };
}

let rows: any[] = [];
let gap = "2026-11-12";
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T16:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify(chart(gap)));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: rows }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};

describe("0057 the last report's move (Finnhub's calendar row, before Nasdaq lists it)", () => {
  it("company-dated with no session: '—', not the next quarter's after-close guess", async () => {
    rows = [
      { symbol: "ZZZQ", date: "2026-11-17", hour: "amc", quarter: 3, year: 2026, epsEstimate: 0.13, epsActual: 0.15, revenueEstimate: null, revenueActual: null },
      { symbol: "ZZZQ", date: "2027-02-24", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.2, epsActual: null, revenueEstimate: null, revenueActual: null },
    ];
    const r = await sheet("ZZZQ");
    const row = r.history.find((h: any) => h.date === "2026-11-12");
    expect(row).toMatchObject({ session: "", move: null });
    expect(r.expectedMove).toBeNull();
  });

  it("a before-open last report is measured on its own day", async () => {
    gap = "2026-11-05";
    rows = [
      { symbol: "ZZZB", date: "2026-11-05", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 1, epsActual: 1.1, revenueEstimate: null, revenueActual: null },
      { symbol: "ZZZB", date: "2027-02-04", hour: "bmo", quarter: 4, year: 2026, epsEstimate: 1, epsActual: null, revenueEstimate: null, revenueActual: null },
    ];
    const r = await sheet("ZZZB");
    const row = r.history.find((h: any) => h.date === "2026-11-05");
    expect(row.session).toBe("bmo");
    expect(row.move).toBeCloseTo(6, 4);
  });
});
