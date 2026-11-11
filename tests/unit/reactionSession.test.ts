import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { reactionMove, sessionHabit } from "../../shared/reaction";

// 0057: a before-the-open report's move is measured on its own day, and an unknown session is never read as
// after the close. WMT-shaped rows under a made-up symbol (no entry in data/date-overrides.json).

describe("reactionMove", () => {
  // Day before 100, report day 106 (the gap), next day 105.
  const closes: Record<string, number> = { "2026-08-19": 100, "2026-08-20": 106, "2026-08-21": 105 };
  const days = Object.keys(closes);
  const closeOn = (d: string, off: number) => { const i = days.indexOf(d); return i < 0 ? null : closes[days[i + off]] ?? null; };

  it("before the open and during hours: the day before → the report day", () => {
    expect(reactionMove("bmo", "2026-08-20", closeOn)).toBeCloseTo(6, 6);
    expect(reactionMove("dmh", "2026-08-20", closeOn)).toBeCloseTo(6, 6);
  });
  it("after the close: the report day → the next day", () => {
    expect(reactionMove("amc", "2026-08-20", closeOn)).toBeCloseTo(-0.943, 2);
  });
  it("unknown session: null, never the after-close guess", () => {
    expect(reactionMove("", "2026-08-20", closeOn)).toBeNull();
    expect(reactionMove(undefined, "2026-08-20", closeOn)).toBeNull();
  });
  it("habit: Finnhub's next, then Nasdaq's listing for that date, then Finnhub's last", () => {
    expect(sessionHabit("amc", "bmo", "bmo")).toBe("amc");
    expect(sessionHabit("", "bmo", "amc")).toBe("bmo");
    expect(sessionHabit("", undefined, "amc")).toBe("amc");
    expect(sessionHabit("", "", "")).toBe("");
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const SYM = "ZZZW";
const next = { symbol: SYM, date: "2026-11-19", hour: "", quarter: 3, year: 2027, epsEstimate: 0.64, epsActual: null, revenueEstimate: 1.9e11, revenueActual: null };
const nasdaqRows = [{ fiscalQtrEnd: "Jul 2026", dateReported: "8/20/2026", eps: 0.68, consensusForecast: "0.73", percentageSurprise: "-6.85" }];

/** Weekday closes at 100 from June to Nov 10, with a +6% gap on Thu Aug 20 (and 105 the day after). */
function chart() {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100;
  for (let t = Date.parse("2026-06-01T20:00:00Z"); t <= Date.parse("2026-11-10T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const day = d.toISOString().slice(0, 10);
    if (day === "2026-08-20") px = 106; else if (day === "2026-08-21") px = 105;
    timestamp.push(t / 1000); close.push(px);
  }
  return { chart: { result: [{ timestamp, indicators: { quote: [{ open: close, high: close, low: close, close }] } }] } };
}

let cache: MemCache;
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T16:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nasdaqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify(chart()));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [next] }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async () => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${SYM}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};

describe("/api/ticker past moves (WMT shape: Finnhub session blank)", () => {
  it("Nasdaq lists the next report before the open: past moves are measured on the report day", async () => {
    cache.store.set(CAL("nq:x:v1:2026-11-19"), JSON.stringify({ [SYM]: "bmo" }));
    const r = await sheet();
    expect(r.history[0]).toMatchObject({ date: "2026-08-20", session: "bmo" });
    expect(r.history[0].move).toBeCloseTo(6, 4);
    expect(r.expectedMove).toBeCloseTo(6, 4);
    expect(r.read.join(" ")).toContain("±6.0%");
  });

  it("no session from any source: move is '—' and the quarter isn't in the typical move", async () => {
    const r = await sheet();
    expect(r.history[0]).toMatchObject({ date: "2026-08-20", session: "", move: null });
    expect(r.expectedMove).toBeNull();
    expect(r.read.join(" ")).not.toMatch(/typical report/);
  });

  it("Finnhub's after-close habit still measures the next day", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nasdaqRows } } }));
      if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify(chart()));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [{ ...next, hour: "amc" }] }));
      return new Response("{}", { status: 404 });
    }));
    const r = await sheet();
    expect(r.history[0].session).toBe("amc");
    expect(r.history[0].move).toBeCloseTo(-0.943, 2);
  });
});
