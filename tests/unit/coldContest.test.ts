import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays, type NqWindow } from "../../shared/crossCheck";
import { applyMemos, dayStanding, memoCross, noteContests, windowCovered, type XMemos } from "../../shared/contestMemo";
import { tickerShareTitle } from "../../shared/pending";
import { reportedCard, tickerShareDesc } from "../../shared/reported";
import { SHEET_DEGRADED_TTL, sheetTtl } from "../../shared/sheetCache";
import worker from "../../worker/index";

// 0083 (critic 2026-11-17 19:00): the Nasdaq cross-check window lives in a per-colo cache, so it keeps going cold.
// Each cold read turned PDD's contested Mon Nov 16 back into "Results were expected before open. None are in our
// data yet", and WSM's og:title into "results expected: none in yet". Missing evidence isn't "no disagreement":
// fail closed ("still checking"), and remember a contest seen once where every colo can read it (KV).
// Made-up symbol, so no live date override can win.

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
class MemKv {
  store = new Map<string, string>();
  puts = 0;
  async get(k: string) { return this.store.get(k) ?? null; }
  fail = 0;
  async put(k: string, v: string) { if (this.fail > 0) { this.fail--; throw new Error("429"); } if (k !== "supp:v1") this.puts++; this.store.set(k, v); } // 0111: the shared supplement writes too; not a contest memo
}
let kv: MemKv;
let env: any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const SYM = "QQPE";
const feedDay = { s: SYM, d: "2026-11-16", h: "bmo", q: 3, y: 2026, eE: 19.2, eA: null, rE: 117e9, rA: null, t: 1 };
const history = [
  { fiscalQtrEnd: "Jun 2026", dateReported: "8/24/2026", eps: 3.1, consensusForecast: "2.9", percentageSurprise: "6.9" },
  { fiscalQtrEnd: "Mar 2026", dateReported: "5/27/2026", eps: 2.5, consensusForecast: "2.7", percentageSurprise: "-7.4" },
  { fiscalQtrEnd: "Dec 2025", dateReported: "3/25/2026", eps: 3.0, consensusForecast: "2.8", percentageSurprise: "7.1" },
];
let upcoming: any[] = [];
let nasdaqDayOk = true;
let cache: MemCache;

beforeEach(() => {
  waits = []; upcoming = []; nasdaqDayOk = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T19:00:00Z")); // Tue, the trading day after the feed's Mon Nov 16
  cache = new MemCache();
  kv = new MemKv();
  env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: kv };
  (globalThis as any).caches = { default: cache };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return nasdaqDayOk ? new Response(JSON.stringify({ data: { rows: [] } })) : new Response("no", { status: 503 });
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: history } } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: url.searchParams.get("symbol") === SYM ? upcoming : [] }));
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 200 });
  }));
  cache.store.set(CAL("cal:v3:2026-11-16"), JSON.stringify([feedDay]));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const sheet = () => get(`/api/ticker/${SYM}`);
/** Nasdaq's window as the calendar caches it, listing the company on `on` (pre-market). */
const nasdaqLists = (on: string | null, today = "2026-11-17") => {
  for (const d of windowDays(today)) cache.store.set(CAL(`nq:x:v1:${d}`), JSON.stringify(d === on ? { [SYM]: "bmo" } : { FILLER: "" }));
};
/** Another colo: none of the Nasdaq days, the folded window or the sheet's own edge copy. */
const goCold = () => { for (const k of [...cache.store.keys()]) if (/nq%3Ax%3A|tk%3A|xc%3A/.test(k)) cache.store.delete(k); };
const noResultsExpected = (t: any) => {
  expect(t.next?.status).not.toBe("results-pending");
  expect(tickerShareTitle(SYM, "Qqpe Holdings", t.next, t.justReported)).not.toMatch(/results expected/i);
  expect(tickerShareDesc("Qqpe Holdings", t)).not.toMatch(/results expected/i);
  expect(t.read.join(" ")).not.toMatch(/were expected|results expected/i);
};

describe("0083: a passed, figure-less feed day with no Nasdaq evidence", () => {
  it("no window at all: 'still checking', not 'results expected'", async () => {
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next).toMatchObject({ date: "2026-11-16", quarter: 3, status: "checking", epsE: 19.2 });
    expect(t.next.overdue).toBeUndefined();
    expect(tickerShareTitle(SYM, "Qqpe Holdings", t.next)).toBe("QQPE's Q3 report: no figures yet, date being checked · Metaphases");
    expect(t.read[0]).toMatch(/still comparing that date with Nasdaq's calendar/);
    expect(reportedCard(t, "2026-11-17")?.headline).toBe("Q3: no figures yet, date being checked");
    expect(sheetTtl(t)).toBe(SHEET_DEGRADED_TTL); // re-read soon, once the window may have warmed
  });

  it("a window missing the later days is no evidence either", async () => {
    nasdaqLists(null);
    for (const d of windowDays("2026-11-17").slice(2)) cache.store.delete(CAL(`nq:x:v1:${d}`));
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next.status).toBe("checking");
  });

  it("a window that lists it 2 days later: Nasdaq's day, as 0078 has it", async () => {
    nasdaqLists("2026-11-19");
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next).toMatchObject({ date: "2026-11-16", nasdaq: { date: "2026-11-19", session: "bmo" } });
    expect(t.next.status).toBeUndefined();
  });

  it("a full window that lists it nowhere: results expected, as before", async () => {
    nasdaqLists(null);
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", status: "results-pending" });
  });
});

describe("0083: a contest seen once survives a cold read", () => {
  it("the sheet keeps Nasdaq's day on a colo with no window", async () => {
    nasdaqLists("2026-11-19");
    await sheet();
    expect(JSON.parse(kv.store.get("xc:v1")!)).toMatchObject({ [SYM]: { d: "2026-11-16", xd: "2026-11-19", xh: "bmo", at: "2026-11-17" } });
    goCold();
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next).toMatchObject({ date: "2026-11-16", nasdaq: { date: "2026-11-19", session: "bmo" } });
  });

  it("the calendar keeps x/xd on a cold read, and writes the memo once", async () => {
    for (const d of ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) cache.store.set(CAL(`cal:v3:${d}`), "[]");
    nasdaqLists("2026-11-19");
    const warm = await get("/api/calendar?from=2026-11-16&to=2026-11-20");
    expect(warm.events.find((e: any) => e.s === SYM)).toMatchObject({ x: "differs", xd: "2026-11-19" });
    const puts = kv.puts;
    expect(puts).toBe(1);
    await get("/api/calendar?from=2026-11-16&to=2026-11-20"); // the same evidence again: no new write
    expect(kv.puts).toBe(puts);
    goCold();
    nasdaqDayOk = false; // and the cold colo can't refill the window
    const cold = await get("/api/calendar?from=2026-11-16&to=2026-11-20");
    expect(cold.events.find((e: any) => e.s === SYM)).toMatchObject({ x: "differs", xd: "2026-11-19", xh: "bmo" });
  });

  it("without the KV binding the sheet still fails closed", async () => {
    delete env.SUPPORT;
    const t = await sheet();
    expect(t.next.status).toBe("checking");
  });
});

describe("0083 self-review", () => {
  it("a full window that lists it nowhere beats an old memo, and drops it", async () => {
    kv.store.set("xc:v1", JSON.stringify({ [SYM]: { d: "2026-11-16", xd: "2026-11-19", xh: "bmo", at: "2026-11-17" } }));
    nasdaqLists(null);
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", status: "results-pending" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(JSON.parse(kv.store.get("xc:v1")!)[SYM]).toBeUndefined();
  });

  it("the day after, Nasdaq's own day calendar listing it on the feed's day is evidence: results expected", async () => {
    cache.store.set(CAL("nq:cal:v3:2026-11-16"), JSON.stringify({ e: { [SYM]: 19.2 }, a: null }));
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-16", status: "results-pending" });
  });

  it("a failed KV write isn't marked done: the next read retries it", async () => {
    nasdaqLists("2026-11-19");
    kv.fail = 1;
    await sheet();
    expect(kv.store.get("xc:v1")).toBeUndefined();
    for (const k of [...cache.store.keys()]) if (/tk%3A/.test(k)) cache.store.delete(k);
    await sheet();
    expect(JSON.parse(kv.store.get("xc:v1")!)[SYM]).toMatchObject({ xd: "2026-11-19" });
  });
});

describe("0083: on the feed's day itself", () => {
  const today = { symbol: SYM, date: "2026-11-17", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 19.2, epsActual: null, revenueEstimate: 117e9, revenueActual: null };
  beforeEach(() => { cache.store.delete(CAL("cal:v3:2026-11-16")); upcoming = [today]; nasdaqDayOk = false; });

  it("session over, Nasdaq unreadable: 'still checking'", async () => {
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next).toMatchObject({ date: "2026-11-17", status: "checking" });
  });

  it("Nasdaq lists it that day (read on demand): results expected, as before", async () => {
    cache.store.set(CAL("nq:x:v1:2026-11-17"), JSON.stringify({ [SYM]: "bmo" }));
    const t = await sheet();
    expect(t.next).toMatchObject({ date: "2026-11-17", status: "results-pending" });
  });

  it("a remembered contest: Nasdaq's day, not a report day", async () => {
    kv.store.set("xc:v1", JSON.stringify({ [SYM]: { d: "2026-11-17", xd: "2026-11-19", xh: "bmo", at: "2026-11-17" } }));
    const t = await sheet();
    noResultsExpected(t);
    expect(t.next).toMatchObject({ date: "2026-11-17", nasdaq: { date: "2026-11-19" } });
    expect(t.next.status).toBeUndefined();
  });
});

describe("contestMemo helpers", () => {
  const T = "2026-11-17";
  const full = (idx: NqWindow["idx"]): NqWindow => ({ from: T, to: "2026-11-30", loaded: windowDays(T), idx });
  const memos: XMemos = { A: { d: "2026-11-16", xd: "2026-11-19", xh: "bmo", at: "2026-11-16" } };

  it("windowCovered only when every weekday loaded", () => {
    expect(windowCovered(null, T)).toBe(false);
    expect(windowCovered(full({}), T)).toBe(true);
    expect(windowCovered({ ...full({}), loaded: windowDays(T).slice(1) }, T)).toBe(false);
  });

  it("memoCross: the same feed day, Nasdaq's day not passed, seen within a week", () => {
    expect(memoCross(memos, "A", "2026-11-16", T)).toEqual({ x: "differs", xd: "2026-11-19", xh: "bmo" });
    expect(memoCross(memos, "A", "2026-11-17", T)).toBeNull(); // another feed day
    expect(memoCross(memos, "A", "2026-11-16", "2026-11-20")).toBeNull(); // Nasdaq's day passed
    expect(memoCross({ A: { ...memos.A, at: "2026-11-05" } }, "A", "2026-11-16", T)).toBeNull(); // stale
    expect(memoCross(null, "A", "2026-11-16", T)).toBeNull();
  });

  it("dayStanding: a current agreement beats the memo; a cold window is 'checking'", () => {
    expect(dayStanding("A", "2026-11-17", "bmo", full({ A: [{ d: "2026-11-17", h: "bmo" }] }), { A: { ...memos.A, d: "2026-11-17" } }, T)).toEqual({ k: "clear" });
    expect(dayStanding("A", "2026-11-16", "bmo", null, memos, T).k).toBe("contested");
    expect(dayStanding("B", "2026-11-16", "bmo", null, memos, T).k).toBe("checking");
    expect(dayStanding("B", "2026-11-16", "bmo", full({}), memos, T).k).toBe("clear");
  });

  it("noteContests: notes, refreshes, drops on agreement, prunes, and says when nothing changed", () => {
    const c = { x: "differs" as const, xd: "2026-11-19", xh: "bmo" as const };
    expect(noteContests(null, [{ s: "B", d: "2026-11-16", c }], T)).toEqual({ B: { d: "2026-11-16", xd: "2026-11-19", xh: "bmo", at: T } });
    const same = { A: { ...memos.A, at: T } };
    expect(noteContests(same, [{ s: "A", d: "2026-11-16", c }], T)).toBeNull();
    expect(noteContests(same, [{ s: "A", d: "2026-11-16", c: { x: "agree" } }], T)).toEqual({});
    expect(noteContests({ A: { ...memos.A, at: "2026-11-01" } }, [], T)).toEqual({});
    expect(noteContests(same, [{ s: "A", d: "2026-11-16", c: null }], T)).toBeNull();
  });

  it("applyMemos: only unflagged, figure-less, feed-dated rows", () => {
    const row = { s: "A", d: "2026-11-16", h: "bmo", q: 3, y: 2026, eE: 1, eA: null, rE: null, rA: null } as any;
    expect(applyMemos([row], memos, T)[0]).toMatchObject({ x: "differs", xd: "2026-11-19", xh: "bmo" });
    expect(applyMemos([{ ...row, x: "agree" }], memos, T)[0].x).toBe("agree");
    expect(applyMemos([{ ...row, eA: 1.2 }], memos, T)[0].x).toBeUndefined();
    expect(applyMemos([{ ...row, o: "https://x" }], memos, T)[0].x).toBeUndefined();
  });
});
