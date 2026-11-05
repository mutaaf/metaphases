import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, closedDay, flagClosed, type DateOverrides } from "../../shared/dateOverrides";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0045: company dates both feeds missed (CSCO, HMC, TSN), and a projected report on a closed-market day
// (MRVL on Thanksgiving) is never stated as fact.

const FILE = overridesFile as unknown as DateOverrides;
const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "", q: 3, y: 2027, eE: 1.11, eA: null, rE: 3.2e9, rA: null, t: 1, ...extra });

describe("closed-market days", () => {
  it("knows NYSE holidays and weekends", () => {
    expect(closedDay("2026-11-26")).toBe("Thanksgiving");
    expect(closedDay("2026-11-28")).toBe("a weekend");
    expect(closedDay("2026-11-27")).toBeNull(); // early close is still a trading day
    expect(closedDay("2026-11-25")).toBeNull();
  });

  it("flags an event projected onto Thanksgiving; the same event with a company date is not flagged", () => {
    const [mrvl, cfirm, ok] = flagClosed([ev("MRVL", "2026-11-26"), ev("XYZ", "2026-11-26", { o: "https://example.com/release" }), ev("CRM", "2026-11-25")]);
    expect(mrvl.c).toBe("Thanksgiving");
    expect(cfirm.c).toBeUndefined();
    expect(ok.c).toBeUndefined();
  });
});

describe("0045 company dates in data/date-overrides.json", () => {
  const today = "2026-11-05";
  it("CSCO: Thu Nov 12 after the close (Finnhub Nov 18 / blank, Nasdaq Nov 11)", () => {
    const out = applyToRows("CSCO", [{ symbol: "CSCO", date: "2026-11-18", hour: "", quarter: 1, year: 2027, epsEstimate: 1.35 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-12", hour: "amc", epsEstimate: 1.35 })]);
  });
  it("HMC: Tue Nov 10 before the US open (15:35 JST), not 'today' on Nov 5", () => {
    const out = applyToRows("HMC", [{ symbol: "HMC", date: "2026-11-05", hour: "", quarter: 2, year: 2027, epsEstimate: 27.43 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-10", hour: "bmo" })]);
  });
  it("TSN: Mon Nov 16 before the open, not after the close", () => {
    const out = applyToRows("TSN", [{ symbol: "TSN", date: "2026-11-16", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.6 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-16", hour: "bmo" })]);
  });
});

// End to end: the worker flags MRVL's Thanksgiving projection on the calendar and the sheet, and The Read
// doesn't state the day as fact.
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const mrvlRow = { symbol: "MRVL", date: "2026-11-26", hour: "", quarter: 3, year: 2027, epsEstimate: 1.1138, epsActual: null, revenueEstimate: 3219504478, revenueActual: null };
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("0045 closed-day projections through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings") && url.searchParams.get("symbol") === "MRVL") return new Response(JSON.stringify({ earningsCalendar: [mrvlRow] }));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [mrvlRow, { ...mrvlRow, symbol: "CRM", date: "2026-11-25", hour: "amc" }] }));
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("/api/calendar flags MRVL on Thanksgiving and leaves CRM alone", async () => {
    const r = await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    expect(r.events.find((e: any) => e.s === "MRVL")).toMatchObject({ d: "2026-11-26", c: "Thanksgiving" });
    expect(r.events.find((e: any) => e.s === "CRM")?.c).toBeUndefined();
  });

  it("/api/ticker/MRVL marks next as on a closed day, and The Read doesn't state the day as fact", async () => {
    const r = await get("/api/ticker/MRVL");
    expect(r.next).toMatchObject({ date: "2026-11-26", closed: "Thanksgiving" });
    expect(r.read[0]).toMatch(/not confirmed/i);
    expect(r.read[0]).not.toMatch(/reports Q3 on/);
  });
});
