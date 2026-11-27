import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays } from "../../shared/crossCheck";
import worker from "../../worker/index";

// 0114 bounce 3 (critic 2026-11-27): 13 of 30 reads unchecked, a day unchecked 94 s+, while Nasdaq was fine.
// Cause: Workers Free allows 50 subrequests per invocation, and Cache API and KV calls count. A calendar read made
// 70–150, so the window's day reads (late in the read) failed silently and the fill's Nasdaq fetch threw "Too many
// subrequests", which was then remembered as Nasdaq failing for 15 minutes. This suite runs the worker on a runtime
// that refuses the 51st call, as Cloudflare does. Made-up symbols (LESSONS 2026-11-06).

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
const fh = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 1, epsActual: null, revenueEstimate: 5e10, revenueActual: null });
// Timeless in the feed; Nasdaq lists both with a time (KR-, ULTA-shaped).
// QQTD is TD-shaped: the feed says after the close, Nasdaq (and the company's 9:30 a.m. call) before the open.
const FH_ROWS = [fh("QQKR", "2026-12-03"), fh("QQUL", "2026-12-03"), { ...fh("QQCR", "2026-12-01", "amc"), revenueEstimate: 5.4e8 }, fh("QQTD", "2026-12-03", "amc")];
const NQ: Record<string, { symbol: string; time: string; marketCap: string }[]> = {
  // CRDO-shaped: small revenue, $20B, admitted only once Nasdaq has sized the day (0110).
  "2026-12-01": [{ symbol: "QQCR", time: "time-after-hours", marketCap: "$20,009,361,400" }],
  "2026-12-03": [
    { symbol: "QQKR", time: "time-pre-market", marketCap: "$40,000,000,000" },
    { symbol: "QQUL", time: "time-after-hours", marketCap: "$25,000,000,000" },
    { symbol: "QQTD", time: "time-pre-market", marketCap: "$191,000,000,000" },
  ],
};
let kv: MemKv;
let env: any;
let colo = "CMH";
const down = new Set<string>();
const nqCalls: Record<string, number> = {};
const colos: Record<string, MemCache> = {};
const on = (c: string) => { colo = c; (globalThis as any).caches = { default: (colos[c] ??= new MemCache()) }; };
const unlock = () => { for (const k of [...colos[colo].store.keys()]) if (k.includes("nq%3Ax%3Alock")) colos[colo].store.delete(k); };
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;

beforeEach(() => {
  waits = []; down.clear();
  for (const k of Object.keys(colos)) delete colos[k];
  for (const k of Object.keys(nqCalls)) delete nqCalls[k];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T18:55:00Z"));
  kv = new MemKv();
  env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: kv };
  on("CMH");
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
      nqCalls[colo] = (nqCalls[colo] ?? 0) + 1;
      if (down.has(colo)) return new Response("nope", { status: 403 });
      const rows = NQ[url.searchParams.get("date")!] ?? [{ symbol: "FILLER", time: "time-not-supplied", marketCap: "$5,000,000,000" }];
      return new Response(JSON.stringify({ data: { asOf: "", headers: {}, rows: rows.map((r) => ({ name: r.symbol, epsForecast: "", ...r })) } }));
    }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      if (sym) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === sym) }));
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
const later = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000));
const RANGE = "/api/calendar?from=2026-11-30&to=2026-12-04";
const row = (r: any, s: string) => (r.events as any[]).find((e) => e.s === s);
/** Load this colo's whole Nasdaq window (two days a request, one builder a minute). */
const warm = async () => { for (let i = 0; i < windowDays(TODAY).length; i++) { unlock(); later(61); await call(RANGE); } };


// ── Cloudflare's per-invocation budget ──────────────────────────────────
const BUDGET = 50;
let used = 0;
let peak = 0;
let order: string[] = [];
const spend = () => { used++; peak = Math.max(peak, used); if (used > BUDGET) throw new Error("Too many subrequests."); };
let raw: { fetch: typeof fetch; cache: () => MemCache; kv: () => MemKv };
const budgeted = () => {
  raw = { fetch: globalThis.fetch, cache: () => colos[colo], kv: () => kv };
  vi.stubGlobal("fetch", async (u: any, i?: any) => { spend(); return (raw.fetch as any)(u, i); });
  (globalThis as any).caches = { get default() { const c = raw.cache(); return { match: async (r: Request) => { spend(); order.push(r.url); return c.match(r); }, put: async (r: Request, s: Response) => { spend(); return c.put(r, s); } }; } };
  env.SUPPORT = { get: async (k: string) => { spend(); return raw.kv().get(k); }, put: async (k: string, v: string) => { spend(); return raw.kv().put(k, v); } };
};
const at = (c: string) => { colo = c; colos[c] ??= new MemCache(); };
/** One invocation: the response plus everything it left in waitUntil, on one budget. */
const invoke = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.allSettled(waits); waits = []; // a refused call in waitUntil is only logged on Cloudflare
  return r.json() as Promise<any>;
};
const run = async (path: string) => { used = 0; return invoke(path); };
const unlockAt = (c: string) => { for (const k of [...colos[c].store.keys()]) if (k.includes("nq%3Ax%3Alock")) colos[c].store.delete(k); };
const fill = async (c: string, path = "/api/xcheck/fill?from=2026-11-30&to=2026-12-04") => { at(c); unlockAt(c); return run(path); };
/** Fill the whole window on colo `c` through the dedicated fill (two days a minute). */
const warmVia = async (c: string) => { for (let i = 0; i < windowDays(TODAY).length; i++) { later(61); await fill(c); } };

describe("0114 bounce 3: the cross-check inside 50 subrequests", () => {
  beforeEach(() => { peak = 0; budgeted(); });

  it("the dedicated fill loads the window and shares it: a cold colo's week read is checked on the first try", async () => {
    await warmVia("CMH");
    expect(peak).toBeLessThanOrEqual(BUDGET);
    at("YYZ");
    const r = await run(RANGE);
    expect(r.uncheckedDays).toBeUndefined();
    expect(row(r, "QQKR")).toMatchObject({ h: "bmo" });
    expect(row(r, "QQTD")).toMatchObject({ x: "differs", xh: "bmo" });
  });

  it("past the 6 h mark a cold colo still reads every day (the share's stale copies), on 10 reads in a row", async () => {
    await warmVia("CMH");
    later(7 * 3600);
    at("ORD");
    for (let i = 0; i < 10; i++) {
      later(10);
      const r = await run(RANGE);
      expect(r.uncheckedDays).toBeUndefined();
      expect(row(r, "QQTD")).toMatchObject({ x: "differs", xh: "bmo" });
    }
  });

  it("on a warm but unfolded window the cross-check's reads come first, before the week reads spend the budget", async () => {
    await warmVia("CMH");
    later(7 * 3600); // stale: never folded, and the feed's day caches have expired too (the expensive read)
    at("CMH");
    order = [];
    const r = await run(RANGE);
    expect(r.uncheckedDays).toBeUndefined();
    const firstOf = (k: string) => order.findIndex((o) => o.includes(k));
    // The window (the share's local copy), the contest memos and the session leads: all inside the first 10 calls.
    for (const k of ["nqw%3Alocal", "xc%3Alocal", "sl%3Alocal"]) { expect(firstOf(k)).toBeGreaterThanOrEqual(0); expect(firstOf(k)).toBeLessThan(10); }
    expect(r.fill).toBe(1); // stale days: the browser is asked to refresh them
  });

  it("a cold colo's first read keeps its weeks: the cross-check never takes the budget the week reads need", async () => {
    // Live 2026-11-27 10:30 UTC (#214): an inline fill and 20 day reads ahead of the week reads left a cold colo's
    // week "Couldn't load". Another colo has filled the share, as in production; these colos have nothing cached.
    await warmVia("CMH");
    later(2 * 3600);
    for (const [c, p] of [["A", RANGE], ["B", "/api/calendar?from=2026-12-07&to=2026-12-11"], ["C", "/api/calendar?from=2026-11-25&to=2026-11-27"]]) {
      at(c);
      const r = await run(p);
      expect(r.warnings).toEqual([]);
      expect(r.uncheckedDays).toBeUndefined();
    }
  });

  it("live 10:30 shape: a cold colo's 7-day chunks, while two window days have no copy anywhere, load every week", async () => {
    // #214 fetched those days inline, ahead of the week reads, and the week reads lost the budget ("Couldn't load").
    await warmVia("CMH");
    const doc = JSON.parse(kv.store.get("nqw:v1")!); delete doc.days["2026-11-30"]; delete doc.days["2026-12-02"]; kv.store.set("nqw:v1", JSON.stringify(doc));
    for (const [c, p] of [["DFW", "/api/calendar?from=2026-11-30&to=2026-12-06"], ["IAD", "/api/calendar?from=2026-11-27&to=2026-12-03"], ["SEA", "/api/calendar?from=2026-12-07&to=2026-12-13"]]) {
      at(c);
      const r = await run(p);
      expect(r.warnings, `${c} ${p}`).toEqual([]);
      expect(r.fill).toBe(1);
    }
  });

  it("a new window day (Dec 10 type): the read stays whole and cheap, says so, and the browser's fill gets the day", async () => {
    await warmVia("CMH");
    const NEW = "2026-12-03"; // a day the share and this colo have never had
    const drop = () => {
      const doc = JSON.parse(kv.store.get("nqw:v1")!); delete doc.days[NEW]; kv.store.set("nqw:v1", JSON.stringify(doc));
      for (const k of [...colos.CMH.store.keys()]) if (k.includes(encodeURIComponent(NEW)) || k.includes("local") || k.includes("idx")) colos.CMH.store.delete(k);
    };
    drop();
    later(61); unlockAt("CMH");
    order = [];
    const r = await run(RANGE);
    expect(r.warnings).toEqual([]);
    expect(r.uncheckedDays).toEqual([NEW]);
    expect(r.fill).toBe(1);
    // The window costs a handful of calls, all ahead of the week reads.
    const firstWeek = order.findIndex((u) => u.includes("cal%3Av3"));
    const win = order.slice(0, firstWeek);
    expect(win.filter((u) => /nq%3Ax%3A(v1|stale|idx)|nqw%3Alocal/.test(u)).length).toBeLessThanOrEqual(6);
    expect(firstWeek).toBeLessThanOrEqual(8);
    // The read's own after-response fill is best effort (it runs last); the browser's, an invocation of its own, lands.
    later(61); unlockAt("CMH");
    peak = 0;
    const f = await fill("CMH");
    expect(f.filling).toContain(NEW);
    expect(peak).toBeLessThanOrEqual(BUDGET);
    expect(JSON.parse(kv.store.get("nqw:v1")!).days[NEW]).toBeTruthy();
    later(10);
    for (const k of [...colos.CMH.store.keys()]) if (k.includes("local")) colos.CMH.store.delete(k);
    expect((await run(RANGE)).uncheckedDays).toBeUndefined();
  });

  it("a three-week read 7 h after the fill, on a colo whose share copy just expired, is still checked", async () => {
    await warmVia("CMH");
    later(7 * 3600);
    at("CMH");
    for (const k of [...colos.CMH.store.keys()]) if (k.includes("nqw%3Alocal")) colos.CMH.store.delete(k);
    const r = await run("/api/calendar?from=2026-11-25&to=2026-12-11");
    expect(r.uncheckedDays).toBeUndefined();
  });

  it("a Nasdaq fetch refused for the budget isn't remembered as Nasdaq failing", async () => {
    at("CMH");
    const real = raw.fetch;
    raw.fetch = (async (u: any, i?: any) => { if (String(u).includes("api.nasdaq.com/api/calendar")) throw new Error("Too many subrequests."); return (real as any)(u, i); }) as any;
    await fill("CMH");
    raw.fetch = real;
    expect([...colos.CMH.store.keys()].some((k) => k.includes("nq%3Ax%3Afail"))).toBe(false);
    later(61);
    const r = await fill("CMH");
    expect(r.filling.length).toBe(2); // the same days are tried again on the next minute
    // whereas a real Nasdaq refusal is remembered (15 minutes)
    down.add("CMH"); later(61);
    await fill("CMH", "/api/xcheck/fill?from=2026-12-07&to=2026-12-08");
    expect([...colos.CMH.store.keys()].some((k) => k.includes("nq%3Ax%3Afail"))).toBe(true);
  });

  it("a colo that never fetched keeps a shared day's caps past 6 h (the $20B untracked row stays admitted)", async () => {
    await warmVia("CMH");
    kv.store.delete("nqcap:v1"); // only the window share is left to size the day
    at("YYZ");
    expect(row(await run(RANGE), "QQCR")).toBeTruthy();
    for (const k of [...colos.YYZ.store.keys()]) if (k.includes("cal%3A")) colos.YYZ.store.delete(k);
    later(7 * 3600);
    expect(row(await run(RANGE), "QQCR")).toBeTruthy();
    later(20 * 60);
    expect(row(await run(RANGE), "QQCR")).toBeTruthy();
  });

  it("the fill is lock-gated: two in the same minute make one set of Nasdaq calls", async () => {
    await fill("CMH");
    const n = nqCalls.CMH ?? 0;
    at("CMH"); const again = await run("/api/xcheck/fill");
    expect(again.filling).toEqual([]);
    expect(again.warnings).toEqual([]);
    expect(nqCalls.CMH ?? 0).toBe(n);
    expect(n).toBeLessThanOrEqual(2);
  });
});
