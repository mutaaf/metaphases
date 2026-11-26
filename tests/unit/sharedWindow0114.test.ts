import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays } from "../../shared/crossCheck";
import { mergeShare, NQW_EMPTY_FRESH_MS, NQW_FRESH_MS, NQW_REWRITE_MS, sharedDays, shareGrows, shareLife } from "../../shared/nqShare";
import { tickerShareTitle } from "../../shared/pending";
import { tickerShareDesc } from "../../shared/reported";
import { sheetTtl, SHEET_DEGRADED_TTL } from "../../shared/sheetCache";
import { retryDelay } from "../../src/lib/partial";
import worker from "../../worker/index";

// 0114 (critic 2026-11-25 19:00): one read in three came back with most of the window `unchecked` and Nasdaq-filled
// sessions blank, because the Nasdaq window's days lived only in each colo's cache and a cold colo fills two days a
// minute. A `/t/*` unfurl fetched there said "not yet confirmed" for a company Nasdaq lists with a time, and
// platforms keep the first unfurl. The days are now shared through KV, and a sheet whose time couldn't be checked says
// "being checked". Made-up symbols, so no live date override can win (LESSONS 2026-11-06).

const H = 3600_000;
describe("0114 shared window, pure", () => {
  const now = Date.UTC(2026, 10, 25, 19);
  it("a shared day lives as long as a colo's own copy would: 6 h, or 1 h when empty; never from the future", () => {
    expect(shareLife({ h: { A: "amc" }, at: now - H }, now)).toBe(NQW_FRESH_MS - H);
    expect(shareLife({ h: { A: "amc" }, at: now - 7 * H }, now)).toBe(0);
    expect(shareLife({ h: {}, at: now - 30 * 60_000 }, now)).toBe(NQW_EMPTY_FRESH_MS - 30 * 60_000);
    expect(shareLife({ h: {}, at: now - 2 * H }, now)).toBe(0);
    expect(shareLife({ h: { A: "amc" }, at: now + 60_000 }, now)).toBe(0);
    expect(shareLife({ at: now }, now)).toBe(0);
    expect(shareLife(null, now)).toBe(0);
  });
  it("sharedDays returns only the asked days still fresh", () => {
    const doc = { "2026-12-01": { h: { A: "amc" as const }, at: now - H }, "2026-12-02": { h: { B: "bmo" as const }, at: now - 8 * H } };
    expect(Object.keys(sharedDays(doc, ["2026-12-01", "2026-12-02", "2026-12-03"], now))).toEqual(["2026-12-01"]);
    expect(sharedDays(null, ["2026-12-01"], now)).toEqual({});
  });
  it("a fetch is offered only when it adds a day, refreshes a stale one, or replaces one over an hour old", () => {
    const doc = { "2026-12-01": { h: { A: "amc" as const }, at: now - 30 * 60_000 } };
    expect(shareGrows(doc, { "2026-12-01": { h: { A: "amc" }, at: now } }, now)).toBe(false); // another colo just wrote it
    expect(shareGrows({ "2026-12-01": { h: { A: "amc" }, at: now - NQW_REWRITE_MS } }, { "2026-12-01": { h: { A: "amc" }, at: now } }, now)).toBe(true);
    expect(shareGrows(doc, { "2026-12-02": { h: {}, at: now } }, now)).toBe(true);
    expect(shareGrows(null, { "2026-12-02": { h: {}, at: now } }, now)).toBe(true);
    expect(shareGrows({ "2026-12-01": { h: { A: "amc" }, at: now - 7 * H } }, { "2026-12-01": { h: { A: "amc" }, at: now } }, now)).toBe(true);
  });
  it("merge keeps the newer copy of each day and drops passed days", () => {
    const latest = { "2026-11-24": { h: { OLD: "bmo" as const }, at: now - 20 * H }, "2026-12-01": { h: { A: "amc" as const }, at: now - 2 * H }, "2026-12-02": { h: { B: "bmo" as const }, at: now } };
    const got = mergeShare(latest, { "2026-12-01": { h: { A: "bmo" }, at: now }, "2026-12-02": { h: {}, at: now - H } }, "2026-11-25");
    expect(got).toEqual({ "2026-12-01": { h: { A: "bmo" }, at: now }, "2026-12-02": { h: { B: "bmo" }, at: now } });
  });
});

describe("0114 a sheet whose time couldn't be checked", () => {
  const next = { date: "2026-12-03", session: "" as const, quarter: 3, year: 2026, epsE: 1, revE: 5e9, projected: true as const, unchecked: true as const };
  it("never unfurls as 'not yet confirmed', and is re-read in 30 s by the edge and the client", () => {
    const title = tickerShareTitle("QQUL", "Qq Ulta", next);
    expect(title).toBe("QQUL earnings on Thu, Dec 3, time being checked · Metaphases");
    expect(title).not.toMatch(/not yet confirmed|expected around/);
    const desc = tickerShareDesc("Qq Ulta", { next, justReported: null, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as any);
    expect(desc).not.toMatch(/not yet confirmed/);
    expect(desc).toMatch(/still being checked against Nasdaq's calendar/);
    expect(sheetTtl({ warnings: [], next } as any)).toBe(SHEET_DEGRADED_TTL);
    expect(retryDelay({ warnings: [], next } as any, 0, true)).not.toBeNull();
    expect(retryDelay({ warnings: [], next: { ...next, unchecked: undefined } } as any, 0, true)).toBeNull();
  });
  it("a checked projection still says so (0007 unchanged)", () => {
    expect(tickerShareTitle("QQUL", "Qq Ulta", { ...next, unchecked: undefined })).toBe("QQUL earnings expected around Thu, Dec 3 (not yet confirmed) · Metaphases");
  });
});

// ── through the worker: two colos, one KV ─────────────────────────────
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
const FH_ROWS = [fh("QQKR", "2026-12-03"), fh("QQUL", "2026-12-03")];
const NQ: Record<string, { symbol: string; time: string; marketCap: string }[]> = {
  "2026-12-03": [
    { symbol: "QQKR", time: "time-pre-market", marketCap: "$40,000,000,000" },
    { symbol: "QQUL", time: "time-after-hours", marketCap: "$25,000,000,000" },
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

describe("0114 through the worker", () => {
  it("a cold colo (its own Nasdaq calls failing) reads the window another colo fetched: checked, sessions filled, no Nasdaq calls", async () => {
    await warm();
    const warmRead = await call(RANGE);
    expect(warmRead.uncheckedDays).toBeUndefined();
    expect(row(warmRead, "QQKR")).toMatchObject({ h: "bmo", hs: "n" });
    expect(kv.store.has("nqw:v1")).toBe(true);

    on("YYZ"); down.add("YYZ");
    for (let i = 0; i < 3; i++) {
      unlock(); later(15);
      const r = await call(RANGE);
      expect(r.uncheckedDays).toBeUndefined();
      expect(r.unchecked).toBeUndefined();
      expect(row(r, "QQKR")).toMatchObject({ h: "bmo", hs: "n" });
      expect(row(r, "QQUL")).toMatchObject({ h: "amc", hs: "n" });
    }
    expect(nqCalls.YYZ ?? 0).toBe(0); // Nasdaq calls per minute go down, not up
  });

  it("the sheet on that cold colo takes Nasdaq's time, so its unfurl reads the same as the warm colo's", async () => {
    await warm();
    const warmSheet = await call("/api/ticker/QQUL");
    on("YYZ"); down.add("YYZ");
    const cold = await call("/api/ticker/QQUL");
    expect(cold.next).toMatchObject({ date: "2026-12-03", session: "amc", hs: "n" });
    expect(cold.next.unchecked).toBeUndefined();
    expect(tickerShareTitle("QQUL", "QQUL", cold.next)).toBe(tickerShareTitle("QQUL", "QQUL", warmSheet.next));
    expect(tickerShareTitle("QQUL", "QQUL", cold.next)).not.toMatch(/not yet confirmed/);
  });

  it("with nothing shared and Nasdaq unreachable, the sheet is 'being checked' (30 s), never 'not yet confirmed'", async () => {
    down.add("CMH");
    const r = await call("/api/ticker/QQUL");
    expect(r.next).toMatchObject({ date: "2026-12-03", session: "", projected: true, unchecked: true });
    expect(tickerShareTitle("QQUL", "QQUL", r.next)).not.toMatch(/not yet confirmed/);
    expect(r.read.join(" ")).not.toMatch(/time not yet confirmed/);
  });

  it("writes stay rare: a second colo's fresh fetch of a day another colo shared minutes ago isn't written again", async () => {
    await warm();
    const writes = kv.puts.filter((k) => k === "nqw:v1").length;
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThanOrEqual(windowDays(TODAY).length / 2 + 1); // one per two-day fill, at most
    on("YYZ");
    for (let i = 0; i < 5; i++) { unlock(); later(61); await call(RANGE); }
    expect(kv.puts.filter((k) => k === "nqw:v1").length).toBe(writes);
  });
});
