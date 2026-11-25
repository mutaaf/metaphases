import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import universe from "../../data/universe.json" with { type: "json" };
import { mergeShared, refreshEntry, supplementSymbols, type SuppDoc, type Universe } from "../../shared/calendarSupplement";
import worker from "../../worker/index";

// 0111 (critic 2026-11-24 19:00): the same calendar range gave different rows read to read. BNS and TD came and went
// because reads land on different Cloudflare colos (CMH, YYZ), and the 0024 supplement document (the only source of
// rows the range feed drops) lived in each colo's own cache. A cold colo refreshes it four symbols a minute, so for
// ~15 minutes it served the range without them (`pending: 57`). The document is now shared through KV: a cold colo
// starts from what any colo has fetched, and the row set is the same wherever the read lands.

const U = universe as unknown as Universe;
const SUPP = supplementSymbols(U);

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) {
    if (req.url.includes("supp%3Akv%3Aseen")) seenTtl[this.name] = res.headers.get("Cache-Control") ?? "";
    this.store.set(req.url, await res.text());
  }
  constructor(public name = "") {}
}
const seenTtl: Record<string, string> = {};
class MemKv {
  store = new Map<string, string>();
  puts: string[] = [];
  gets = 0;
  async get(k: string) { if (k === "supp:v1") this.gets++; return this.store.get(k) ?? null; }
  async put(k: string, v: string) { this.puts.push(k); this.store.set(k, v); }
}
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;
let kv: MemKv;
let env: any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;

// Finnhub as on 2026-11-24: the range feed has BMO (as BMO.TO) but not TD; `symbol=TD` lists TD on Thu Dec 3.
// (BNS was the example until it got a company-dated override in 0107 bounce 1, which places it without the supplement.)
const FEED = [{ symbol: "BMO.TO", date: "2026-12-02", hour: "amc", quarter: 4, year: 2026, epsEstimate: 3.78, epsActual: null, revenueEstimate: 1e10, revenueActual: null }];
const TD_ROW = { symbol: "TD.TO", date: "2026-12-03", hour: "amc", quarter: 4, year: 2026, epsEstimate: 2.6, epsActual: null, revenueEstimate: 1.59e10, revenueActual: null };
let finnhubCalls = 0;

const colos: Record<string, MemCache> = {};
const on = (colo: string) => { (globalThis as any).caches = { default: (colos[colo] ??= new MemCache(colo)) }; };
const unlockSupp = (colo: string) => colos[colo].store.delete(CAL("cal:supp:lock:v1"));
/** Another request already took this minute's refresh: the per-request budget is spent. */
const budgetSpent = (colo: string) => colos[colo].store.set(CAL("cal:supp:lock:v1"), "1");

beforeEach(() => {
  waits = []; finnhubCalls = 0;
  for (const k of Object.keys(colos)) delete colos[k];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T19:00:00Z"));
  kv = new MemKv();
  env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: kv };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      finnhubCalls++;
      const sym = url.searchParams.get("symbol");
      if (sym) return new Response(JSON.stringify({ earningsCalendar: sym === "TD" ? [TD_ROW] : [] }));
      const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
      return new Response(JSON.stringify({ earningsCalendar: FEED.filter((r) => r.date >= from && r.date <= to) }));
    }
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const RANGE = "/api/calendar?from=2026-12-02&to=2026-12-03";
const syms = (r: any) => (r.events as { s: string }[]).map((e) => e.s).sort();
/** Fill one colo's supplement the slow way (four symbols a minute), as production does. */
const warmColo = async (colo: string) => {
  on(colo);
  let r: any;
  for (let i = 0; i < Math.ceil(SUPP.length / 4) + 2; i++) {
    unlockSupp(colo);
    vi.setSystemTime(new Date(Date.now() + 61_000));
    r = await get(RANGE);
  }
  return r;
};

describe("0111: the supplement is one document every colo reads", () => {
  it("a warm colo has TD from the supplement (the range feed has no TD row)", async () => {
    const r = await warmColo("CMH");
    expect(r.pending).toBeUndefined();
    expect(syms(r)).toEqual(expect.arrayContaining(["BMO", "TD"]));
  });

  it("a cold colo with its refresh budget spent returns the same rows, not fewer (TD stays)", async () => {
    const warm = await warmColo("CMH");
    on("YYZ");
    budgetSpent("YYZ");
    const callsBefore = finnhubCalls;
    const cold = await get(RANGE);
    expect(syms(cold)).toEqual(syms(warm));
    expect(cold.pending).toBeUndefined();
    // It cost no extra `symbol=` calls: the shared copy replaced them.
    expect(finnhubCalls - callsBefore).toBeLessThanOrEqual(1); // at most the one range call for its own day cache
    // And ten reads in a row, alternating colos, all agree.
    for (let i = 0; i < 10; i++) {
      on(i % 2 ? "CMH" : "YYZ");
      expect(syms(await get(RANGE))).toEqual(syms(warm));
    }
  });

  it("a single-day read on a third cold colo agrees with the range's subset for that day", async () => {
    const warm = await warmColo("CMH");
    on("IAD");
    budgetSpent("IAD");
    const day = await get("/api/calendar?from=2026-12-02&to=2026-12-02");
    expect(syms(day)).toEqual((warm.events as { s: string; d: string }[]).filter((e) => e.d === "2026-12-02").map((e) => e.s).sort());
  });

  it("KV writes stay few: a full fill writes as the shared copy grows, then at most once an hour", async () => {
    await warmColo("CMH");
    const fill = kv.puts.filter((k) => k === "supp:v1").length;
    expect(fill).toBeGreaterThan(0);
    expect(fill).toBeLessThanOrEqual(Math.ceil(SUPP.length / 4) + 1);
    // Twelve hours of refreshes later (every entry stale again), one colo writes at most about once an hour.
    vi.setSystemTime(new Date(Date.now() + 12 * 3600_000));
    for (let i = 0; i < 30; i++) { unlockSupp("CMH"); vi.setSystemTime(new Date(Date.now() + 61_000)); await get(RANGE); }
    expect(kv.puts.filter((k) => k === "supp:v1").length - fill).toBeLessThanOrEqual(1);
  });

  it("five colos refreshing all afternoon: the account writes the shared copy a handful of times, not per colo", async () => {
    await warmColo("CMH");
    const fill = kv.puts.filter((k) => k === "supp:v1").length;
    for (const c of ["YYZ", "IAD", "ORD", "EWR", "ATL"]) { on(c); await get(RANGE); }
    vi.setSystemTime(new Date(Date.now() + 13 * 3600_000)); // every entry stale, KV's newest fetch 13 h old
    for (let i = 0; i < 60; i++) {
      const c = ["CMH", "YYZ", "IAD", "ORD", "EWR", "ATL"][i % 6];
      on(c); unlockSupp(c); vi.setSystemTime(new Date(Date.now() + 61_000)); await get(RANGE);
    }
    expect(kv.puts.filter((k) => k === "supp:v1").length - fill).toBeLessThanOrEqual(2);
  });

  it("corrupt KV: a cold colo serves what it has and the next refresh rewrites the copy", async () => {
    kv.store.set("supp:v1", "{not json");
    const r = await warmColo("YYZ");
    expect(syms(r)).toContain("TD");
    expect(() => JSON.parse(kv.store.get("supp:v1")!)).not.toThrow();
  });

  it("a cold colo reads KV at most about once a minute while its copy is incomplete", async () => {
    on("YYZ");
    budgetSpent("YYZ");
    for (let i = 0; i < 5; i++) await get(RANGE);
    expect(kv.gets).toBe(1); // the seen marker holds it off for a minute
    vi.setSystemTime(new Date(Date.now() + 61_000));
    colos.YYZ.store.delete(CAL("supp:kv:seen:v1")); // the marker's minute has passed
    await get(RANGE);
    expect(kv.gets).toBe(2);
  });

  it("right after a deploy (KV empty, every colo cold): a colo that read the empty copy picks it up a minute after another colo fills it", async () => {
    on("YYZ");
    budgetSpent("YYZ");
    expect(syms(await get(RANGE))).not.toContain("TD"); // nothing anywhere yet
    await warmColo("CMH"); // CMH fills KV
    on("YYZ");
    vi.setSystemTime(new Date(Date.now() + 61_000));
    // The cache honours max-age in production; the mock doesn't, so expire the marker as a 60 s TTL would.
    expect(Number(/max-age=(\d+)/.exec(seenTtl.YYZ ?? "")?.[1])).toBe(60);
    colos.YYZ.store.delete(CAL("supp:kv:seen:v1"));
    budgetSpent("YYZ");
    const r = await get(RANGE);
    expect(syms(r)).toContain("TD");
    expect(r.pending).toBeUndefined();
  });

  it("a fully warm colo with nothing due for refresh still fills an empty shared copy (within ~10 minutes, not 12 h)", async () => {
    await warmColo("CMH");
    kv.store.delete("supp:v1"); // as on the first deploy: CMH's copy predates KV
    const puts = kv.puts.length;
    vi.setSystemTime(new Date(Date.now() + 11 * 60_000)); // past the check marker; no entry is 12 h old
    for (const k of [...colos.CMH.store.keys()]) if (k.includes("supp%3Akv%3Achk")) colos.CMH.store.delete(k);
    unlockSupp("CMH");
    await get(RANGE);
    expect(kv.puts.length).toBe(puts + 1);
    expect(Object.keys(JSON.parse(kv.store.get("supp:v1")!))).toContain("TD");
    // and a cold colo now gets the whole list in one read
    on("YYZ"); budgetSpent("YYZ");
    const r = await get(RANGE);
    expect(r.pending).toBeUndefined();
    expect(syms(r)).toContain("TD");
  });

  it("no KV binding (local dev): the per-colo supplement works as before", async () => {
    env.SUPPORT = undefined;
    const r = await warmColo("CMH");
    expect(syms(r)).toContain("TD");
    expect(kv.gets + kv.puts.length).toBe(0);
  });
});

describe("0111: merging colos' documents", () => {
  const ev = (d: string) => ({ s: "TD", d, h: "bmo" as const, q: 4, y: 2026, eE: 2.6, eA: d < "2026-12-04" ? 2.7 : null, rE: 1.5e10, rA: null, t: 1 as const });
  it("the later fetch wins, but keeps the other's past report it no longer returns", () => {
    const old: SuppDoc = { TD: refreshEntry(undefined, [ev("2026-12-03"), ev("2027-02-26")], "2026-12-02", 1_000, 0) };
    const fresh: SuppDoc = { TD: refreshEntry(undefined, [ev("2027-02-26")], "2026-12-05", 9_000, 0) };
    const m = mergeShared("2026-12-05", old, fresh);
    expect(m.TD.rows.map((r) => r.d)).toEqual(["2026-12-03", "2027-02-26"]);
    expect(m.TD.f).toBe(9_000);
    expect(mergeShared("2026-12-05", fresh, old)).toEqual(m); // order doesn't matter
  });
  it("compares real fetch times, not the jittered refresh time", () => {
    const early = refreshEntry(undefined, [ev("2027-02-20")], "2026-12-05", 5_000_000, 0); // at = 5,000,000
    const late = refreshEntry(undefined, [ev("2027-02-26")], "2026-12-05", 6_000_000, 0.9); // at = 2,760,000, fetched later
    expect(mergeShared("2026-12-05", { TD: early }, { TD: late }).TD.rows.map((r) => r.d)).toEqual(["2027-02-26"]);
  });
});
