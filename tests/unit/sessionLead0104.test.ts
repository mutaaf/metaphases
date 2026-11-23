import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLeads, leadFor, nasdaqSessionLeads, noteLead, type SessionLeads } from "../../shared/sessionLead";
import { contestedSession } from "../../shared/reaction";
import { settleContested } from "../../shared/contestedTime";
import { tickerShareTitle } from "../../shared/pending";
import { buildIcs } from "../../shared/depth";
import { nasdaqLabel } from "../../src/lib/dateMark";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0104 (split from 0102): Hormel read "after close" (the feed) for a before-the-open report. Nasdaq listed the same day
// pre-market and the last four reports all moved the stock on the report day. When the feed's timed session
// contradicts both Nasdaq's for that day and every recent report (at least 3 measured), Nasdaq's session leads,
// "expected" (the company hasn't said), with the feed's named beside it, on the sheet, the calendar, the ICS and the
// share title alike. Made-up symbols (LESSONS 2026-11-06), so no live date override can win.

const REPORTS = ["2026-08-27", "2026-05-28", "2026-02-26", "2025-11-25"]; // newest first

/** Weekday closes, flat at 100 except around each report: `day[i]` is the report day's move, `next[i]` the day after's (%). */
function closes(day: number[], next: number[]) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, bump: number | null = null;
  for (let t = Date.parse("2025-09-01T20:00:00Z"); t <= Date.parse("2026-11-20T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const i = REPORTS.indexOf(iso);
    if (bump != null) { px *= 1 + bump / 100; bump = null; }
    if (i >= 0) { px *= 1 + day[i] / 100; bump = next[i]; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { timestamp, close };
}
const closeOnFor = ({ timestamp, close }: { timestamp: number[]; close: number[] }) => {
  const days = timestamp.map((t) => new Date(t * 1000).toISOString().slice(0, 10));
  return (d: string, off: number) => { const i = days.indexOf(d); return i < 0 ? null : close[i + off] ?? null; };
};

// Hormel-shaped: every report's move lands on the report day (before the open).
const BMO_DAY = [-3.1, 2.4, -4.0, 5.2], BMO_NEXT = [0.4, -0.6, 0.9, -1.1];
// Mixed 2–2: two reports moved on the day, two the day after.
const MIX_DAY = [5, 5, 1, 1], MIX_NEXT = [1, 1, 5, 5];
// 3 of 4: enough for 0060's habit, not for the headline.
const THREE_DAY = [5, 5, 5, 1], THREE_NEXT = [1, 1, 1, 5];

describe("nasdaqSessionLeads", () => {
  it("feed amc, Nasdaq bmo, every report on the report day: Nasdaq's session leads", () => {
    expect(nasdaqSessionLeads("amc", "bmo", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(true);
    expect(nasdaqSessionLeads("amc", "bmo", REPORTS.slice(0, 3), closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(true);
  });
  it("a split (2–2), 3 of 4, or fewer than 3 measured reports keeps the feed's session", () => {
    expect(nasdaqSessionLeads("amc", "bmo", REPORTS, closeOnFor(closes(MIX_DAY, MIX_NEXT)))).toBe(false);
    const three = closeOnFor(closes(THREE_DAY, THREE_NEXT));
    expect(contestedSession("amc", "bmo", REPORTS, three)).toBe("bmo"); // 0060's habit is unchanged
    expect(nasdaqSessionLeads("amc", "bmo", REPORTS, three)).toBe(false);
    expect(nasdaqSessionLeads("amc", "bmo", REPORTS.slice(0, 2), closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(false);
  });
  it("the history backing the feed, agreeing calendars or an untimed side never lead", () => {
    expect(nasdaqSessionLeads("bmo", "amc", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(false);
    expect(nasdaqSessionLeads("bmo", "bmo", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(false);
    expect(nasdaqSessionLeads("", "bmo", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(false);
    expect(nasdaqSessionLeads("amc", "dmh", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe(false);
  });
});

const row = (s: string, d: string, h: EarningsEvent["h"], extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h, q: 4, y: 2026, eE: 0.38, eA: null, rE: 3e9, rA: null, t: 1, ...extra }) as EarningsEvent;

describe("the recorded verdict (calendar side)", () => {
  const today = "2026-11-23";
  const memos: SessionLeads = { ZZHL: { d: "2026-12-03", h: "bmo", f: "amc", at: today } };
  it("noteLead writes, re-stamps only after a few days, and drops on current evidence against it", () => {
    const m = noteLead(null, "ZZHL", "2026-12-03", { h: "bmo", f: "amc" }, today)!;
    expect(m.ZZHL).toEqual({ d: "2026-12-03", h: "bmo", f: "amc", at: today });
    expect(noteLead(m, "ZZHL", "2026-12-03", { h: "bmo", f: "amc" }, "2026-11-24")).toBeNull();
    expect(noteLead(m, "ZZHL", "2026-12-03", null, "2026-11-24")).toEqual({});
    expect(noteLead(m, "ZZHL", "2026-12-10", null, "2026-11-24")).toBeNull(); // another day: not this verdict
    expect(noteLead(m, "OTHR", "2026-12-03", null, "2026-12-04")).toEqual({}); // past its day: pruned
  });
  it("the calendar row reads h: bmo, expected, with the feed's session named, once the sheet has recorded it", () => {
    const [cold, warm] = [
      applyLeads([row("ZZHL", "2026-12-03", "amc")], memos, today)[0],
      applyLeads([row("ZZHL", "2026-12-03", "amc", { x: "differs", xd: "2026-12-03", xh: "bmo" })], memos, today)[0],
    ];
    for (const e of [cold, warm]) {
      expect(e).toMatchObject({ h: "bmo", hs: "n", fh: "amc", x: "differs", xd: "2026-12-03", xh: "bmo" });
      expect(settleContested(e).h).toBe("bmo"); // the client no longer blanks it as contested
      expect(nasdaqLabel(e)).toBe("Feed: after close · Nasdaq: before open");
    }
  });
  it("no memo: the contested row stays 'time unconfirmed', never the feed's session as fact", () => {
    const e = applyLeads([row("ZZHL", "2026-12-03", "amc", { x: "differs", xd: "2026-12-03", xh: "bmo" })], {}, today)[0];
    expect(settleContested(e)).toMatchObject({ h: "", fh: "amc" });
  });
  it("a company date, figures in, current evidence against it, or a stale memo: untouched", () => {
    const keep = [
      row("ZZHL", "2026-12-03", "bmo", { o: "https://example.com/ir" }),
      row("ZZHL", "2026-12-03", "amc", { eA: 0.4 }),
      row("ZZHL", "2026-12-03", "amc", { x: "agree" }),
      row("ZZHL", "2026-12-03", "amc", { x: "differs", xd: "2026-12-04", xh: "bmo" }),
      row("ZZHL", "2026-12-02", "amc"),
    ];
    expect(applyLeads(keep, memos, today)).toEqual(keep);
    expect(leadFor(memos, "ZZHL", "2026-12-03", "amc", "2026-12-04")).toBeNull();
    expect(leadFor({ ZZHL: { ...memos.ZZHL, at: "2026-11-10" } }, "ZZHL", "2026-12-03", "amc", today)).toBeNull();
  });
  it("the ICS names Nasdaq's session as expected", () => {
    const ics = buildIcs([{ symbol: "ZZHL", name: "Zz Foods", date: "2026-12-03", session: "bmo", quarter: 4, year: 2026, epsE: 0.38, url: "https://x/t/ZZHL", expected: true }], new Date("2026-11-23T15:00:00Z"));
    expect(ics).toContain("SUMMARY:ZZHL earnings · before the open (expected)");
    expect(ics.replace(/\r\n /g, "")).toContain("the company hasn't said");
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
class MemKv {
  store = new Map<string, string>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async put(k: string, v: string) { this.store.set(k, v); }
}
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;
const SYM = "ZZHL";
const DAY = "2026-12-03";
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 0.4, consensusForecast: "0.38", percentageSurprise: "5.26" }; });
let cache: MemCache, kv: MemKv, env: any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let feedSym = SYM;

function stub(chart: { timestamp: number[]; close: number[] }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: chart.timestamp, indicators: { quote: [{ open: chart.close, high: chart.close, low: chart.close, close: chart.close }] } }] } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999", sym = url.searchParams.get("symbol");
      const rows = [{ symbol: feedSym, date: DAY, hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.38, epsActual: null, revenueEstimate: 3e9, revenueActual: null }];
      return new Response(JSON.stringify({ earningsCalendar: rows.filter((r) => (sym ? r.symbol === sym : DAY >= from && DAY <= to)) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 404 });
  }));
}
beforeEach(() => {
  waits = []; feedSym = SYM;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  cache = new MemCache(); kv = new MemKv();
  env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: kv };
  (globalThis as any).caches = { default: cache };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string, raw = false) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return raw ? r.text() : r.json();
};
const nasdaqSays = (h: "bmo" | "amc") => cache.store.set(CAL(`nq:x:v1:${DAY}`), JSON.stringify({ [SYM]: h }));
/** Another colo: no Nasdaq days, no sheet copy, no local KV copies. */
const goCold = () => { for (const k of [...cache.store.keys()]) if (/nq%3Ax%3A|tk%3A|sl%3Alocal|xc%3Alocal|cal%3A/.test(k)) cache.store.delete(k); };

describe("0104 through the worker", () => {
  it("sheet: Nasdaq's session leads, expected, the feed's named; the share title, calendar and ICS agree", async () => {
    stub(closes(BMO_DAY, BMO_NEXT));
    nasdaqSays("bmo");
    const t: any = await get(`/api/ticker/${SYM}`);
    expect(t.next).toMatchObject({ date: DAY, session: "bmo", hs: "n", feedSession: "amc" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(t.next.confirmed).toBeUndefined();
    const read = t.read.join(" ");
    expect(read).toContain("before the opening bell (expected; the company hasn't said)");
    expect(read).toContain("Our data feed says after the close.");
    expect(read).not.toMatch(/time unconfirmed/);
    expect(tickerShareTitle(SYM, "Zz Foods", t.next, t.justReported)).toBe(`${SYM} reports Thu, Dec 3 before the open (expected) · Metaphases`);
    expect(JSON.parse(kv.store.get("sl:v1")!)[SYM]).toMatchObject({ d: DAY, h: "bmo", f: "amc" });

    // The calendar on this colo (Nasdaq's day cached) and on a cold one (only the KV verdict) say the same.
    for (const cold of [false, true]) {
      if (cold) goCold();
      const c: any = await get(`/api/calendar?from=${DAY}&to=${DAY}`);
      const e = c.events.find((x: any) => x.s === SYM);
      expect(e).toMatchObject({ d: DAY, h: "bmo", hs: "n", fh: "amc" });
      expect(settleContested(e).h).toBe("bmo");
    }
    const ics = String(await get(`/api/ics?s=${SYM}`, true));
    expect(ics).toContain(`SUMMARY:${SYM} earnings · before the open (expected)`);
  });

  it("mixed history (2–2): the feed's session is kept and the disagreement flagged; nothing recorded", async () => {
    stub(closes(MIX_DAY, MIX_NEXT));
    nasdaqSays("bmo");
    const t: any = await get(`/api/ticker/${SYM}`);
    expect(t.next).toMatchObject({ date: DAY, session: "amc", nasdaq: { date: DAY, session: "bmo" } });
    expect(t.next.feedSession).toBeUndefined();
    expect(tickerShareTitle(SYM, "Zz Foods", t.next, t.justReported)).toContain("time unconfirmed");
    expect(kv.store.get("sl:v1")).toBeUndefined();
    const c: any = await get(`/api/calendar?from=${DAY}&to=${DAY}`);
    expect(settleContested(c.events.find((x: any) => x.s === SYM)).h).toBe("");
    expect(String(await get(`/api/ics?s=${SYM}`, true))).toContain(`SUMMARY:${SYM} earnings · time not yet confirmed`);
  });

  it("Nasdaq now agrees with the feed: a recorded verdict is dropped and the feed's session stands", async () => {
    kv.store.set("sl:v1", JSON.stringify({ [SYM]: { d: DAY, h: "bmo", f: "amc", at: "2026-11-22" } }));
    stub(closes(BMO_DAY, BMO_NEXT));
    nasdaqSays("amc");
    const t: any = await get(`/api/ticker/${SYM}`);
    expect(t.next).toMatchObject({ session: "amc" });
    expect(t.next.feedSession).toBeUndefined();
    expect(JSON.parse(kv.store.get("sl:v1")!)).toEqual({});
  });

  it("a company-dated override always wins over the rule (HRL: Dec 3 before the open, the company's word)", async () => {
    feedSym = "HRL";
    stub(closes(BMO_DAY, BMO_NEXT));
    cache.store.set(CAL(`nq:x:v1:${DAY}`), JSON.stringify({ HRL: "bmo" }));
    kv.store.set("sl:v1", JSON.stringify({ HRL: { d: DAY, h: "bmo", f: "amc", at: "2026-11-23" } }));
    const t: any = await get(`/api/ticker/HRL`);
    expect(t.next).toMatchObject({ date: DAY, session: "bmo" });
    expect(t.next.confirmed).toMatch(/^https:\/\//);
    expect(t.next.hs).toBeUndefined();
    expect(t.next.feedSession).toBeUndefined();
    const c: any = await get(`/api/calendar?from=${DAY}&to=${DAY}`);
    const e = c.events.find((x: any) => x.s === "HRL");
    expect(e).toMatchObject({ h: "bmo" });
    expect(e.o).toMatch(/^https:\/\//);
    expect(e.hs).toBeUndefined();
    expect(e.fh).toBeUndefined();
  });
});
