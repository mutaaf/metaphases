import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import universe from "../../data/universe.json" with { type: "json" };
import { aliasMap, supplementSymbols, type Universe } from "../../shared/calendarSupplement";
import { windowDays } from "../../shared/crossCheck";
import { capsGrow, mergeCapDocs } from "../../shared/untrackedGate";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0110 bounce 2 (critic 2026-11-25 07:00, builder check 18:30 UTC):
// - CRDO ($20B, $540M revenue) was on Dec 1 on every read served by CMH and on none served by YYZ. Nasdaq's dollar
//   caps lived in each colo's own cache, so a colo that hadn't sized the day (or whose Nasdaq calls fail) fell back
//   to the revenue gate. The caps are now shared through one small KV document, day → caps.
// - TCOM ($25.6B) was missing on every read: Finnhub's range feed labels it with its Hong Kong listing (9961.HK),
//   and untracked dotted symbols are dropped. Tracking it (as 0107 did for the Canadian banks) lets the 0024 alias
//   rename the row and the supplement cover any gap.

const U = universe as unknown as Universe;

describe("0110 shared caps, pure", () => {
  it("merges per day (union, largest cap wins) and drops days before keepFrom", () => {
    const shared = { "2026-11-10": { OLD: 50_000 }, "2026-12-01": { CRDO: 19_000, HQY: 7_900 } };
    const local = { "2026-12-01": { CRDO: 20_009 }, "2026-12-02": { NTSK: 11_000 } };
    expect(mergeCapDocs(shared, local, "2026-11-11")).toEqual({
      "2026-12-01": { CRDO: 20_009, HQY: 7_900 },
      "2026-12-02": { NTSK: 11_000 },
    });
    expect(mergeCapDocs(null, local, "2026-11-11")).toEqual(local);
  });
  it("a colo offers its copy only when it holds a symbol the shared one lacks", () => {
    const shared = { "2026-12-01": { CRDO: 20_009, HQY: 7_900 } };
    expect(capsGrow(shared, { "2026-12-01": { CRDO: 20_009 } }, "2026-11-11")).toBe(false);
    expect(capsGrow(shared, { "2026-12-01": {} }, "2026-11-11")).toBe(false);
    expect(capsGrow(shared, { "2026-12-01": { BOX: 6_300 } }, "2026-11-11")).toBe(true);
    expect(capsGrow(null, { "2026-12-02": { NTSK: 11_000 } }, "2026-11-11")).toBe(true);
    expect(capsGrow(null, { "2026-11-01": { OLD: 1 } }, "2026-11-11")).toBe(false);
  });
});

describe("0110 TCOM is tracked", () => {
  it("in the universe as a CNY reporter with a dollar market value, aliased from 9961.HK, in the supplement", () => {
    expect(U.TCOM).toMatchObject({ n: expect.stringMatching(/Trip\.com/), ec: "CNY", mcCur: "CNY" });
    const e = U.TCOM as typeof U[string] & { mcL: number; fx: number };
    expect(e.mc).toBe(Math.round(e.mcL * e.fx));
    expect(e.mc).toBeGreaterThan(10_000);
    expect(aliasMap(U)["9961.HK"]).toBe("TCOM");
    expect(supplementSymbols(U)).toContain("TCOM");
  });
  it("the weekly refresh keeps it (build_universe.py's EXTRA list)", () => {
    const src = readFileSync(new URL("../../scripts/build_universe.py", import.meta.url), "utf8");
    expect(/EXTRA = """([\s\S]*?)"""/.exec(src)![1].split(/\s+/)).toContain("TCOM");
  });
});

// ── through the worker, two colos and one KV ─────────────────────────────
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
class MemKv {
  store = new Map<string, string>();
  puts: string[] = [];
  async get(k: string) { return this.store.get(k) ?? null; }
  async put(k: string, v: string) { this.puts.push(k); this.store.set(k, v); }
}
const TODAY = "2026-11-25";
const fh = (symbol: string, date: string, rev: number, hour = "amc") =>
  ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 0.1, epsActual: null, revenueEstimate: rev, revenueActual: null });
const FH_ROWS = [
  fh("CRDO", "2026-12-01", 5.4e8), // $20B, small revenue: admitted only once Nasdaq has sized it
  fh("9961.HK", "2026-12-01", 1.93e10), // Trip.com under its Hong Kong listing
];
const NQ: Record<string, { symbol: string; time: string; marketCap: string }[]> = {
  "2026-12-01": [
    { symbol: "CRDO", time: "time-after-hours", marketCap: "$20,009,361,400" },
    { symbol: "TCOM", time: "time-after-hours", marketCap: "$25,647,894,500" },
  ],
};
let kv: MemKv;
let env: any;
let colo = "CMH";
const down = new Set<string>();
const colos: Record<string, MemCache> = {};
const on = (c: string) => { colo = c; (globalThis as any).caches = { default: (colos[c] ??= new MemCache()) }; };
const unlock = () => { for (const k of [...colos[colo].store.keys()]) if (k.includes("nq%3Ax%3Alock") || k.includes("cal%3Asupp%3Alock")) colos[colo].store.delete(k); };
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;

beforeEach(() => {
  waits = []; down.clear();
  for (const k of Object.keys(colos)) delete colos[k];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T18:30:00Z"));
  kv = new MemKv();
  env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: kv };
  on("CMH");
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
      if (down.has(colo)) return new Response("nope", { status: 403 });
      const rows = NQ[url.searchParams.get("date")!] ?? [{ symbol: "FILLER", time: "time-not-supplied", marketCap: "$5,000,000,000" }];
      return new Response(JSON.stringify({ data: { asOf: "", headers: {}, rows: rows.map((r) => ({ name: r.symbol, epsForecast: "", ...r })) } }));
    }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      if (sym) return new Response(JSON.stringify({ earningsCalendar: sym === "TCOM" ? [FH_ROWS[1]] : [] }));
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
const DEC1 = "/api/calendar?from=2026-12-01&to=2026-12-01";
const RANGE = "/api/calendar?from=2026-11-25&to=2026-12-04";
const later = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000));
const syms = (r: any) => new Set((r.events as EarningsEvent[]).map((e) => e.s));
/** Load this colo's whole Nasdaq window (two days a request, one builder a minute), then let unsized days expire. */
const warm = async () => {
  for (let i = 0; i < windowDays(TODAY).length; i++) { unlock(); later(61); await call(RANGE); }
  later(301);
  return call(RANGE);
};

describe("0110 bounce: every colo sizes a day any colo has loaded", () => {
  it("CRDO is on Dec 1 on a colo whose Nasdaq calls fail, once another colo has loaded that day", async () => {
    const cmh = await warm();
    expect(syms(cmh).has("CRDO")).toBe(true);
    on("YYZ"); down.add("YYZ");
    const yyz = await call(DEC1);
    expect((yyz.events as EarningsEvent[]).filter((e) => e.s === "CRDO")).toEqual([expect.objectContaining({ d: "2026-12-01", h: "amc", t: 0 })]);
    // and it stays there read after read
    for (let i = 0; i < 3; i++) { later(400); unlock(); expect(syms(await call(DEC1)).has("CRDO")).toBe(true); }
  });

  it("with nothing shared yet, a colo that can't reach Nasdaq still falls back to the revenue gate", async () => {
    on("YYZ"); down.add("YYZ");
    expect(syms(await call(DEC1)).has("CRDO")).toBe(false);
  });

  it("KV is written only when a colo holds caps it lacks: a warm colo's later reads, and a second colo's, write nothing", async () => {
    await warm();
    const filled = kv.puts.filter((k) => k === "nqcap:v1").length;
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThanOrEqual(windowDays(TODAY).length);
    for (let i = 0; i < 12; i++) { later(1801); unlock(); await call(RANGE); }
    on("ORD");
    await warm();
    expect(kv.puts.filter((k) => k === "nqcap:v1").length).toBe(filled);
  });

  it("TCOM is on Dec 1 after the close under its US ticker, on every colo", async () => {
    for (const c of ["CMH", "YYZ"]) {
      on(c);
      const r = await call(DEC1);
      expect((r.events as EarningsEvent[]).filter((e) => e.s === "TCOM")).toEqual([expect.objectContaining({ d: "2026-12-01", h: "amc", t: 1 })]);
      expect(syms(r).has("9961.HK")).toBe(false);
    }
  });
});
