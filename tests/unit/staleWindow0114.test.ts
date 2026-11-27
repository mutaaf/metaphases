import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays } from "../../shared/crossCheck";
import { NQW_STALE_MS, staleDays } from "../../shared/nqShare";
import { settleContested } from "../../shared/contestedTime";
import worker from "../../worker/index";

// 0114 bounce 1 (critic 2026-11-26): after #205 the first reads on a colo still came back with every day unchecked,
// and TD (feed "amc", Nasdaq "bmo") carried no contest marker, so the calendar filed it under "After close" as fact.
// Every copy of a Nasdaq day (each colo's and the KV share) expired at the same 6 h mark, so each refresh reopened a
// cold window. Now a day past its 6 h keeps serving (up to 24 h) while it's re-fetched, and a row on a day that still
// couldn't be checked never shows the feed's session alone. Made-up symbols (LESSONS 2026-11-06).

const H = 3600_000;
describe("0114 stale window days, pure", () => {
  const now = Date.UTC(2026, 10, 26, 8);
  it("a shared day older than its fresh life is still usable as a stale copy for 24 h (never from the future)", () => {
    const doc = { days: { "2026-12-01": { h: { A: "amc" }, at: now - 7 * H }, "2026-12-02": { h: { B: "bmo" }, at: now - 25 * H }, "2026-12-03": { h: {}, at: now + H } } };
    expect(NQW_STALE_MS).toBe(24 * H);
    expect(staleDays(doc, ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"], now)).toEqual({ "2026-12-01": { h: { A: "amc" } } });
    expect(staleDays(null, ["2026-12-01"], now)).toEqual({});
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
  const body = (await r.json()) as any;
  // 0114 bounce 3: what the browser does with `fill` (askFill): the window's fill, in a request of its own.
  if (body?.fill) {
    const q = new URL(`https://x${path}`).searchParams;
    await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/xcheck/fill?from=${q.get("from")}&to=${q.get("to")}`), env, ctx);
    await Promise.all(waits); waits = [];
  }
  return body;
};
const later = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000));
const RANGE = "/api/calendar?from=2026-11-30&to=2026-12-04";
const row = (r: any, s: string) => (r.events as any[]).find((e) => e.s === s);
/** Load this colo's whole Nasdaq window (two days a request, one builder a minute). */
const warm = async () => { for (let i = 0; i < windowDays(TODAY).length; i++) { unlock(); later(61); await call(RANGE); } };

const sessionsOf = (r: any) => (r.events as any[]).map(settleContested);

describe("0114 bounce 1 through the worker", () => {
  it("when every copy passes 6 h at once, the next reads stay checked from the stale copy and TD stays contested", async () => {
    await warm();
    expect(row(await call(RANGE), "QQTD")).toMatchObject({ h: "amc", x: "differs", xh: "bmo" });
    later(6 * 3600 + 60); down.add("CMH"); // the refresh fails, too: the stale copy is all there is
    for (let i = 0; i < 4; i++) {
      unlock(); later(8);
      const r = await call(RANGE);
      expect(r.uncheckedDays).toBeUndefined();
      expect(row(r, "QQTD")).toMatchObject({ x: "differs", xh: "bmo" });
      expect(sessionsOf(r).find((e: any) => e.s === "QQTD").h).toBe(""); // Time TBD, never "after close"
      expect(row(r, "QQKR")).toMatchObject({ h: "bmo", hs: "n" });
    }
  });

  it("a cold colo takes the share's stale copy (no own cache at all), and refreshes it without extra Nasdaq calls", async () => {
    await warm();
    later(7 * 3600);
    on("YYZ");
    unlock();
    const r = await call(RANGE);
    expect(r.uncheckedDays).toBeUndefined();
    expect(row(r, "QQTD")).toMatchObject({ x: "differs", xh: "bmo" });
    expect(nqCalls.YYZ ?? 0).toBeLessThanOrEqual(2); // the usual two-day fill, no more
    // and the refreshed days are fresh again: the next minute's read fills two more, the share is rewritten
    unlock(); later(61); await call(RANGE);
    expect(nqCalls.YYZ ?? 0).toBeLessThanOrEqual(4);
  });

  it("a stale window is never folded into the hour-long index (so the refresh keeps going)", async () => {
    await warm();
    later(6 * 3600 + 60);
    unlock(); await call(RANGE);
    const before = nqCalls.CMH ?? 0;
    unlock(); later(61); await call(RANGE);
    expect((nqCalls.CMH ?? 0) - before).toBeGreaterThan(0);
  });

  it("with no copy anywhere, a row on an unchecked day never shows the feed's session alone", async () => {
    down.add("CMH");
    const r = await call(RANGE);
    expect(r.uncheckedDays).toContain("2026-12-03");
    const td = row(r, "QQTD");
    expect(td.h).toBe("");
    expect(td).toMatchObject({ fh: "amc", hu: 1 });
  });

  it("a checked read keeps the feed's session where Nasdaq agrees (the hold is only for unchecked days)", async () => {
    await warm();
    const r = await call(RANGE);
    expect(r.uncheckedDays).toBeUndefined();
    expect((r.events as any[]).some((e) => e.hu)).toBe(false);
    expect(row(r, "QQCR")).toMatchObject({ h: "amc" });
  });
});

describe("0114 bounce 1 review: a stale day is enough to compare a row, never current evidence", () => {
  it("a read with a stale day neither clears nor writes the shared contest memos", async () => {
    await warm();
    const memo = JSON.stringify({ QQUL: { d: "2026-12-03", xd: "2026-12-01", xh: "amc", at: "2026-11-25" } });
    kv.store.set("xc:v1", memo);
    later(6 * 3600 + 60); down.add("CMH");
    for (const k of [...colos.CMH.store.keys()]) if (k.includes("xc%3Alocal")) colos.CMH.store.delete(k);
    unlock(); const r = await call(RANGE);
    expect(r.uncheckedDays).toBeUndefined();
    expect(kv.store.get("xc:v1")).toBe(memo); // a fresh remembered contest survives a 24 h old listing
  });

  it("the sheet re-fetches its next day when the window only has it stale", async () => {
    await warm();
    later(6 * 3600 + 60);
    const before = nqCalls.CMH ?? 0;
    unlock(); await call("/api/ticker/QQUL");
    expect((nqCalls.CMH ?? 0) - before).toBeGreaterThan(0);
  });

  it("an empty Nasdaq answer never becomes a day's stale stand-in", () => {
    const now = Date.UTC(2026, 10, 26, 8);
    expect(staleDays({ days: { "2026-12-01": { h: {}, at: now - 2 * H } } }, ["2026-12-01"], now)).toEqual({});
  });
});
