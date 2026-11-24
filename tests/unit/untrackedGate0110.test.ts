import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admitUntracked, capUsd, foldCaps, nasdaqDayCaps, UNTRACKED_MIN_CAP } from "../../shared/untrackedGate";
import { windowDays } from "../../shared/crossCheck";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0110: the calendar admitted untracked companies by quarterly revenue in the feed's currency (1B), so a $490M ADR
// with CN¥1.9B revenue showed while Rubrik (RBRK, $22B), Credo (CRDO, $19B), Nutanix (NTNX, $15B) and Guidewire
// (GWRE, $11B) were on Nasdaq's calendar and missing here (critic, 2026-11-24). Nasdaq's dollar cap now decides.

describe("0110 the untracked gate is dollar size", () => {
  it("a $20B company with $500M revenue is admitted", () => {
    expect(admitUntracked(5e8, 20e9, false)).toBe(true);
    expect(admitUntracked(0, UNTRACKED_MIN_CAP, false)).toBe(true);
  });
  it("a $300M company with CN¥2B revenue isn't, unless a company date names it", () => {
    expect(admitUntracked(2e9, 3e8, false)).toBe(false);
    expect(admitUntracked(2e9, 3e8, true)).toBe(true);
  });
  it("a $5B company with $300M revenue isn't; with $1B+ revenue it is", () => {
    expect(admitUntracked(3e8, 5e9, false)).toBe(false);
    expect(admitUntracked(1.2e9, 5e9, false)).toBe(true);
  });
  it("with no Nasdaq size, the revenue gate stands", () => {
    expect(admitUntracked(2e9, undefined, false)).toBe(true);
    expect(admitUntracked(5e8, undefined, false)).toBe(false);
    expect(admitUntracked(5e8, 0, false)).toBe(false);
  });
  it("Nasdaq's rows slim to untracked symbol → $ millions; tracked and capless rows are left out", () => {
    const body = { data: { rows: [
      { symbol: "RBRK", marketCap: "$22,140,000,000" },
      { symbol: "AAPL", marketCap: "$4,000,000,000,000" },
      { symbol: "NOCAP", marketCap: "N/A" },
      { symbol: "BRK/B", marketCap: "$1,000,000,000" },
      { symbol: "TINY", marketCap: "$400,000" },
    ] } };
    const caps = nasdaqDayCaps(body, (s) => s === "AAPL");
    expect(caps).toEqual({ RBRK: 22140, "BRK.B": 1000, TINY: 1 });
    expect(capUsd(caps, "RBRK")).toBe(22.14e9);
    expect(capUsd(caps, "NOCAP")).toBeUndefined();
    expect(foldCaps([{ A: 5 }, null, { A: 7, B: 1 }])).toEqual({ A: 7, B: 1 });
  });
});

// ── through the worker ───────────────────────────────────────────────────
/** A cache that honours max-age against the (faked) clock, so a short-lived day really expires. */
class MemCache {
  store = new Map<string, { body: string; exp: number }>();
  async match(req: Request) {
    const v = this.store.get(req.url);
    return v === undefined || v.exp <= Date.now() ? undefined : new Response(v.body);
  }
  async put(req: Request, res: Response) {
    const age = Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1] ?? 86400);
    this.store.set(req.url, { body: await res.text(), exp: Date.now() + age * 1000 });
  }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const TODAY = "2026-11-24";
const fh = (symbol: string, date: string, rev: number, hour = "amc") =>
  ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 0.1, epsActual: null, revenueEstimate: rev, revenueActual: null });
const FH_ROWS = [
  fh("RBRK", "2026-11-30", 3.5e8), // $22B, small revenue: admitted (it used to be dropped)
  fh("NTNX", "2026-11-24", 6.8e8), // $15B
  fh("QQSM", "2026-11-30", 2e9), // $300M ADR with CN¥2B revenue: dropped once Nasdaq sizes it
  fh("QQMID", "2026-11-30", 3e8), // $5B, small revenue: not admitted
  fh("GOTU", "2026-11-24", 3e8, ""), // $490M, but the company dated it (override): kept
  fh("QQFAR", "2027-01-20", 2e9), // past the window, no Nasdaq size: the revenue gate stands
];
const NQ: Record<string, { symbol: string; time: string; marketCap: string }[]> = {
  "2026-11-24": [{ symbol: "NTNX", time: "time-after-hours", marketCap: "$15,020,000,000" }],
  "2026-11-25": [{ symbol: "GOTU", time: "time-pre-market", marketCap: "$491,190,208" }],
  "2026-11-30": [
    { symbol: "RBRK", time: "time-after-hours", marketCap: "$22,140,000,000" },
    { symbol: "QQSM", time: "time-after-hours", marketCap: "$300,000,000" },
    { symbol: "QQMID", time: "time-after-hours", marketCap: "$5,000,000,000" },
  ],
};
let finnhubRange = 0;
const store = () => (globalThis as any).caches.default.store as Map<string, unknown>;
const unlock = () => { for (const k of [...store().keys()]) if (k.includes("nq%3Ax%3Alock")) store().delete(k); };

describe("0110 on the worker", () => {
  beforeEach(() => {
    waits = []; finnhubRange = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T19:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
        const rows = NQ[url.searchParams.get("date")!] ?? [{ symbol: "FILLER", time: "time-not-supplied", marketCap: "$5,000,000,000" }];
        return new Response(JSON.stringify({ data: { asOf: "", headers: {}, rows: rows.map((r) => ({ name: r.symbol, epsForecast: "", ...r })) } }));
      }
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
      if (url.pathname.endsWith("/calendar/earnings")) {
        const sym = url.searchParams.get("symbol");
        if (sym) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === sym) }));
        finnhubRange++;
        const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
        return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.date >= from && r.date <= to) }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response(JSON.stringify({}), { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const call = async (path: string) => {
    const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
    await Promise.all(waits); waits = [];
    return r.json() as Promise<any>;
  };
  const RANGE = "/api/calendar?from=2026-11-23&to=2026-12-04";
  const later = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000));
  /** Loads the whole Nasdaq window (2 days a request, one builder a minute), then lets the unsized days expire. */
  const warm = async () => {
    for (let i = 0; i < windowDays(TODAY).length; i++) { unlock(); await call(RANGE); }
    later(301);
    return call(RANGE);
  };
  const syms = (r: any) => new Set(r.events.map((e: EarningsEvent) => e.s));

  it("once Nasdaq's window is in, RBRK and NTNX are on Nasdaq's day; the small ADR and the $5B name aren't; GOTU stays", async () => {
    const r = await warm();
    expect(r.events.filter((e: EarningsEvent) => e.s === "RBRK")).toEqual([expect.objectContaining({ d: "2026-11-30", h: "amc", t: 0 })]);
    expect(r.events.filter((e: EarningsEvent) => e.s === "NTNX")).toEqual([expect.objectContaining({ d: "2026-11-24", h: "amc", t: 0 })]);
    expect(syms(r).has("QQSM")).toBe(false);
    expect(syms(r).has("QQMID")).toBe(false);
    expect(r.events.filter((e: EarningsEvent) => e.s === "GOTU")).toEqual([expect.objectContaining({ d: "2026-11-25", h: "bmo" })]);
  });

  it("each Nasdaq day's untracked caps are cached beside its sessions", async () => {
    await warm();
    const raw = store().get(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:cap:v1:2026-11-30")}`) as { body: string };
    expect(JSON.parse(raw.body)).toEqual({ RBRK: 22140, QQSM: 300, QQMID: 5000 });
  });

  it("past the window, with no Nasdaq size, the revenue gate stands", async () => {
    await warm();
    const r = await call("/api/calendar?from=2027-01-18&to=2027-01-22");
    expect(syms(r).has("QQFAR")).toBe(true);
  });

  it("a day written before the window loaded expires in 5 minutes, not 30, and costs one range call a week", async () => {
    const cold = await call(RANGE);
    expect(syms(cold).has("RBRK")).toBe(false); // revenue gate: Nasdaq hasn't sized it yet
    const calls = finnhubRange;
    expect(calls).toBeLessThanOrEqual(2);
    const r = await warm();
    expect(syms(r).has("RBRK")).toBe(true);
    // Every refresh is still one range call per week of the range (two weeks here).
    expect(finnhubRange - calls).toBeLessThanOrEqual(2 * (windowDays(TODAY).length + 1));
  });
});
