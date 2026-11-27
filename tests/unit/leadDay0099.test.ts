import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leadIns, leadRows, leadsNasdaq } from "../../shared/leadDay";
import { tickerShareTitle } from "../../shared/pending";
import { tickerShareDesc } from "../../shared/reported";
import { contestedDay } from "../../shared/closedRows";
import { eventProjected } from "../../shared/projected";
import { nasdaqLabel, dateMark, disagreeWhy } from "../../src/lib/dateMark";
import { redFlags } from "../../src/lib/hype";
import { factsFor } from "../../worker/ai/prompts";
import { readFileSync } from "node:fs";
import type { EarningsEvent, TickerResponse } from "../../shared/types";
import worker from "../../worker/index";

// 0099: Kohl's and Urban Outfitters, Sun Nov 22. The feed projects Mon Nov 23 with no time; Nasdaq's calendar lists
// Tue Nov 24 (KSS before the open, URBN after the close). Nasdaq's timed listing leads, still unconfirmed, and the
// feed's day is named beside it. A feed row with its own session, a company date, or a Nasdaq listing with no session
// keeps the feed's day, as before.
const TODAY = "2026-11-22";

describe("leadsNasdaq", () => {
  const kss = { date: "2026-11-23", session: "" };
  it("leads with Nasdaq's timed day over the feed's timeless projection", () => {
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "bmo" }, TODAY)).toBe(true);
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "amc" }, TODAY)).toBe(true);
  });
  it("keeps the feed's day when the feed has a session, the company dated it, or Nasdaq gives no time", () => {
    expect(leadsNasdaq({ ...kss, session: "amc" }, { date: "2026-11-24", session: "bmo" }, TODAY)).toBe(false);
    expect(leadsNasdaq({ ...kss, source: "https://corporate.kohls.com/" }, { date: "2026-11-24", session: "bmo" }, TODAY)).toBe(false);
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "" }, TODAY)).toBe(false);
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "dmh" }, TODAY)).toBe(false);
    expect(leadsNasdaq(kss, { date: "2026-11-23", session: "bmo" }, TODAY)).toBe(false); // same day: 0050 fills the session
    expect(leadsNasdaq(kss, null, TODAY)).toBe(false); // a cold cross-check
  });
  it("also on and after the feed's own day (review: KSS mustn't flip back on Monday), until Nasdaq's day passes", () => {
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "bmo" }, "2026-11-23")).toBe(true);
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "bmo" }, "2026-11-24")).toBe(true);
    expect(leadsNasdaq(kss, { date: "2026-11-24", session: "bmo" }, "2026-11-25")).toBe(false);
    expect(leadsNasdaq({ date: "2026-11-25", session: "" }, { date: "2026-11-20", session: "bmo" }, TODAY)).toBe(false);
  });
});

const row = (s: string, d: string, h: EarningsEvent["h"], extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h, q: 3, y: 2026, eE: 0.1, eA: null, rE: 3.5e9, rA: null, ...extra }) as EarningsEvent;

describe("leadRows (the calendar)", () => {
  it("places the row on Nasdaq's day and session, keeping the feed's day as the evidence", () => {
    const [kss, urbn, amat, co, nt] = leadRows([
      row("KSS", "2026-11-23", "", { x: "differs", xd: "2026-11-24", xh: "bmo" }),
      row("URBN", "2026-11-23", "", { x: "differs", xd: "2026-11-24", xh: "amc" }),
      row("ZZAM", "2026-11-23", "amc", { x: "differs", xd: "2026-11-24", xh: "bmo" }),
      row("ZZCO", "2026-11-23", "", { o: "https://example.com/ir", x: "differs", xd: "2026-11-24", xh: "bmo" }),
      row("ZZNT", "2026-11-23", "", { x: "differs", xd: "2026-11-24" }),
    ], "2026-11-23", "2026-11-27", TODAY);
    expect(kss).toMatchObject({ d: "2026-11-24", h: "bmo", hs: "n", x: "differs", xd: "2026-11-23", xf: 1 });
    expect(kss.xh).toBeUndefined();
    expect(urbn).toMatchObject({ d: "2026-11-24", h: "amc", xd: "2026-11-23", xf: 1 });
    expect(amat).toMatchObject({ d: "2026-11-23", h: "amc", xd: "2026-11-24" });
    expect(co.d).toBe("2026-11-23");
    expect(nt).toMatchObject({ d: "2026-11-23", h: "" });
    for (const e of [amat, co, nt]) expect(e.xf).toBeUndefined();
  });
  it("0112: drops the row from this range when Nasdaq's day is outside it (it belongs to Nasdaq's day, whatever the range)", () => {
    // Was "leaves the row where it is": a one-day read of the feed's day then listed PVH on Dec 1 while every week read had Dec 3.
    const out = leadRows([
      row("KSS", "2026-11-20", "", { x: "differs", xd: "2026-11-23", xh: "bmo" }),
      row("ZZAM", "2026-11-20", "amc", { x: "differs", xd: "2026-11-23", xh: "bmo" }),
      row("ZZNT", "2026-11-20", "", { x: "differs", xd: "2026-11-23" }),
    ], "2026-11-16", "2026-11-20", "2026-11-19");
    expect(out.map((e) => e.s)).toEqual(["ZZAM", "ZZNT"]); // a timed feed row or an untimed Nasdaq listing keeps the feed's day
  });
  it("0112 review: a feed day that has passed stays in its range (leadIns doesn't pick it up, so dropping it would lose it)", () => {
    const past = row("KSS", "2026-11-20", "", { x: "differs", xd: "2026-11-24", xh: "bmo" });
    expect(leadRows([past], "2026-11-20", "2026-11-20", "2026-11-23")).toEqual([past]);
    expect(leadIns([], [past], "2026-11-24", "2026-11-24", "2026-11-23")).toEqual([]);
  });
  it("0112: a feed row on day A that Nasdaq lists on day B is not in a one-day read of A, and is in a one-day read of B", () => {
    const pvh = row("PVH", "2026-12-01", "", { x: "differs", xd: "2026-12-03", xh: "bmo" });
    const today = "2026-11-25";
    expect(leadRows([pvh], "2026-12-01", "2026-12-01", today)).toEqual([]);
    const week = leadRows([pvh], "2026-11-30", "2026-12-04", today);
    const one = leadIns([], [pvh], "2026-12-03", "2026-12-03", today);
    expect(one).toEqual(week);
    expect(one).toEqual([expect.objectContaining({ s: "PVH", d: "2026-12-03", h: "bmo", hs: "n", xd: "2026-12-01", xf: 1 })]);
    // Not when the company already has a row in the range, not into a range that misses Nasdaq's day, not twice.
    expect(leadIns([row("PVH", "2026-12-03", "bmo")], [pvh], "2026-12-03", "2026-12-03", today)).toEqual([]);
    expect(leadIns([], [pvh], "2026-12-02", "2026-12-02", today)).toEqual([]);
    expect(leadIns([], [pvh, { ...pvh }], "2026-12-03", "2026-12-04", today)).toHaveLength(1);
    // Nothing a wider range wouldn't move: a timed feed row, a company date, figures in.
    for (const e of [{ ...pvh, h: "amc" as const }, { ...pvh, o: "https://example.com/ir" }, { ...pvh, eA: 1 }]) expect(leadIns([], [e], "2026-12-03", "2026-12-03", today)).toEqual([]);
  });
  it("a moved row is marked by the feed's day, still unconfirmed, and never filed as a contested passed day", () => {
    const [kss] = leadRows([row("KSS", "2026-11-23", "", { x: "differs", xd: "2026-11-24", xh: "bmo" })], "2026-11-23", "2026-11-27", TODAY);
    expect(nasdaqLabel(kss)).toBe("Feed projects Mon, Nov 23");
    expect(dateMark(kss, TODAY)).toEqual({ kind: "differs", label: "Feed projects Mon, Nov 23" });
    expect(eventProjected(kss, TODAY)).toBe(true);
    expect(contestedDay(kss, "2026-11-24")).toBe(false); // Nasdaq's day has come: not "our feed says this day, but Nasdaq lists…"
  });
});

const sheet = (next: TickerResponse["next"]) => ({ next, justReported: undefined, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } }) as unknown as TickerResponse;

describe("share title and description", () => {
  const next = { date: "2026-11-24", session: "bmo" as const, quarter: 3, year: 2026, epsE: 0.1, revE: 3.5e9, hs: "n" as const, feedDay: "2026-11-23" };
  it("leads with Nasdaq's day and still says unconfirmed, naming the feed's day", () => {
    expect(tickerShareTitle("KSS", "Kohl's", next)).toBe("KSS reports Tue, Nov 24 before the open (unconfirmed; our data feed projects Mon, Nov 23) · Metaphases");
    expect(tickerShareTitle("URBN", "Urban Outfitters", { ...next, session: "amc" })).toBe("URBN reports Tue, Nov 24 after the close (unconfirmed; our data feed projects Mon, Nov 23) · Metaphases");
    expect(tickerShareDesc("Kohl's", sheet(next))).toMatch(/^Kohl's — report date unconfirmed \(Nasdaq lists Tue, Nov 24; the feed projects Mon, Nov 23\)/);
  });
  it("without the lead, today's titles are unchanged", () => {
    const { feedDay: _f, hs: _h, ...plain } = next;
    expect(tickerShareTitle("KSS", "Kohl's", { ...plain, date: "2026-11-23", session: "", nasdaq: { date: "2026-11-24", session: "bmo" }, projected: true })).toBe("KSS reports Mon, Nov 23 (unconfirmed; Nasdaq lists Tue, Nov 24) · Metaphases");
  });
});

describe("review: the other surfaces never state Nasdaq's leading day as settled", () => {
  const NVDA = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8")) as TickerResponse;
  const lead = { date: "2026-11-24", session: "bmo" as const, quarter: 3, year: 2026, epsE: 0.1, revE: 3.5e9, hs: "n" as const, feedDay: "2026-11-23" };
  it("Hype Check's 'Reports in N days' says the date is unconfirmed", () => {
    const t = structuredClone(NVDA);
    t.next = lead;
    expect(redFlags(t, { tracked: true, today: TODAY }).find((f) => f.key === "soon")?.label).toBe("Reports in 2 days (date unconfirmed)");
  });
  it("the AI is told the date is unconfirmed, with the feed's day", () => {
    const facts = factsFor("ticker", { symbol: "KSS", name: "Kohl's", next: lead }).join("\n");
    expect(facts).toMatch(/on 2026-11-24 bmo, date unconfirmed \(Nasdaq's calendar lists this day and time; our feed projects 2026-11-23/);
  });
  it("the 'isn't confirmed' note names the right mark (drawer and Compass)", () => {
    expect(disagreeWhy(1, 0)).toBe("Nasdaq's calendar lists it on another day or time, marked “Nasdaq” below.");
    expect(disagreeWhy(1, 1)).toBe("Nasdaq's calendar lists it here, but our data feed projects another day, marked “Feed projects” below.");
    expect(disagreeWhy(3, 1)).toBe("our data feed and Nasdaq's calendar list them on different days or times, marked below.");
  });
});

// ── the worker: the sheet and the calendar ──────────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const fhRow = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 0.1, epsActual: null, revenueEstimate: 3.5e9, revenueActual: null });
// Made-up symbols, so no live entry in data/date-overrides.json can win (LESSONS 2026-11-06).
const FH_ROWS = [fhRow("QQKS", "2026-11-23"), fhRow("QQUR", "2026-11-23"), fhRow("QQAM", "2026-11-23", "amc"), fhRow("QQNT", "2026-11-23")];
const nqDay = (rows: { symbol: string; time: string }[]) => ({ data: { asOf: "", headers: {}, rows: rows.map((r) => ({ name: r.symbol, marketCap: "$5,000,000,000", epsForecast: "$0.10", ...r })) } });
let cold = false;
const store = () => (globalThis as any).caches.default.store as Map<string, string>;
const unlock = () => { for (const k of [...store().keys()]) if (k.includes("nq%3Ax%3Alock")) store().delete(k); };

beforeEach(() => {
  waits = []; cold = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z")); // Sunday 10 AM ET
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
      if (cold) return new Response("nope", { status: 503 });
      const day = url.searchParams.get("date");
      return new Response(JSON.stringify(nqDay(day === "2026-11-24"
        ? [{ symbol: "QQKS", time: "time-pre-market" }, { symbol: "QQUR", time: "time-after-hours" }, { symbol: "QQAM", time: "time-pre-market" }, { symbol: "QQNT", time: "time-not-supplied" }]
        : [{ symbol: "FILLER", time: "time-not-supplied" }])));
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
const WEEK = "/api/calendar?from=2026-11-23&to=2026-11-27";
const warm = async () => { let r: any; for (let i = 0; i < 6; i++) { unlock(); r = await call(WEEK); } return r; };

describe("0099 on the worker", () => {
  it("the sheet headlines Nasdaq's day and session and names the feed's projection", async () => {
    await warm();
    const t = await call("/api/ticker/QQKS");
    expect(t.next).toMatchObject({ date: "2026-11-24", session: "bmo", hs: "n", feedDay: "2026-11-23" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(t.next.projected).toBeUndefined();
    expect(t.read[0]).toMatch(/^Nasdaq's calendar lists .*Q3 report on Tuesday, Nov 24 before the opening bell, but that's unconfirmed: our data feed projects Monday, Nov 23, and we haven't found a company announcement of the date\.$/);
    const u = await call("/api/ticker/QQUR");
    expect(u.next).toMatchObject({ date: "2026-11-24", session: "amc", feedDay: "2026-11-23" });
  });

  it("a feed row with its own session, or a Nasdaq listing with no time, keeps the feed's day", async () => {
    await warm();
    const a = await call("/api/ticker/QQAM");
    expect(a.next).toMatchObject({ date: "2026-11-23", session: "amc", nasdaq: { date: "2026-11-24", session: "bmo" } });
    expect(a.next.feedDay).toBeUndefined();
    const n = await call("/api/ticker/QQNT");
    expect(n.next).toMatchObject({ date: "2026-11-23", nasdaq: { date: "2026-11-24", session: "" } });
    expect(n.next.feedDay).toBeUndefined();
  });

  it("the calendar places the row on Nasdaq's day, still counted as not confirmed; the feed's day no longer lists it", async () => {
    const r = await warm();
    const of = (s: string) => r.events.filter((e: EarningsEvent) => e.s === s);
    expect(of("QQKS")).toEqual([expect.objectContaining({ d: "2026-11-24", h: "bmo", x: "differs", xd: "2026-11-23", xf: 1 })]);
    expect(of("QQUR")).toEqual([expect.objectContaining({ d: "2026-11-24", h: "amc", xf: 1 })]);
    expect(of("QQAM")).toEqual([expect.objectContaining({ d: "2026-11-23", h: "amc", xd: "2026-11-24" })]);
    const tue = r.events.filter((e: EarningsEvent) => e.d === "2026-11-24" && e.x === "differs").map((e: EarningsEvent) => e.s).sort();
    expect(tue).toEqual(["QQKS", "QQUR"]);
    expect(r.events.filter((e: EarningsEvent) => e.d === "2026-11-23").map((e: EarningsEvent) => e.s).sort()).toEqual(["QQAM", "QQNT"]);
  });

  it("on the feed's own day (Mon Nov 23), the sheet and the calendar still lead with Tuesday", async () => {
    vi.setSystemTime(new Date("2026-11-23T15:00:00Z")); // Monday 10 AM ET
    const r = await warm();
    expect(r.events.filter((e: EarningsEvent) => e.s === "QQKS")).toEqual([expect.objectContaining({ d: "2026-11-24", h: "bmo", xd: "2026-11-23", xf: 1 })]);
    const t = await call("/api/ticker/QQKS");
    expect(t.next).toMatchObject({ date: "2026-11-24", session: "bmo", feedDay: "2026-11-23" });
    expect(t.next.status).toBeUndefined();
    expect(t.read[0]).toMatch(/^Nasdaq's calendar lists .* on Tuesday, Nov 24 before the opening bell, but that's unconfirmed/);
  });

  it("the calendar subscription (ICS) puts the report on Nasdaq's day, tentative, with no stated time", async () => {
    await warm();
    const r = await worker.fetch(new Request("https://mutaafaziz.com/metaphases/api/ics?s=QQKS,QQAM"), env, ctx);
    const ics = await r.text();
    const ev = ics.split("BEGIN:VEVENT").slice(1);
    const kss = ev.find((e) => e.includes("QQKS"))!;
    expect(kss).toMatch(/DTSTART;VALUE=DATE:20261124/);
    expect(kss).toMatch(/TENTATIVE/);
    expect(ev.find((e) => e.includes("QQAM"))).toMatch(/DTSTART[^\n]*20261123/);
  });

  it("0112: one-day reads agree with the week: the feed's day doesn't list the moved row, Nasdaq's day does", async () => {
    const week = await warm();
    for (const d of ["2026-11-23", "2026-11-24", "2026-11-25"]) {
      unlock();
      const one = await call(`/api/calendar?from=${d}&to=${d}`);
      const syms = (r: any) => r.events.filter((e: EarningsEvent) => e.d === d).map((e: EarningsEvent) => `${e.s}:${e.h}`).sort();
      expect(syms(one)).toEqual(syms(week));
    }
    unlock();
    const mon = await call("/api/calendar?from=2026-11-23&to=2026-11-23");
    expect(mon.events.map((e: EarningsEvent) => e.s).sort()).toEqual(["QQAM", "QQNT"]);
    unlock();
    const tue = await call("/api/calendar?from=2026-11-24&to=2026-11-24");
    expect(tue.events.filter((e: EarningsEvent) => e.s === "QQKS")).toEqual([expect.objectContaining({ d: "2026-11-24", h: "bmo", hs: "n", x: "differs", xd: "2026-11-23", xf: 1, eE: 0.1 })]);
  });

  it("0112 review: Nasdaq down, a remembered contest (0083) only: the row is on Nasdaq's day in every read, never lost", async () => {
    cold = true;
    const kvStore = new Map<string, string>([["xc:v1", JSON.stringify({ QQKS: { d: "2026-11-23", xd: "2026-11-24", xh: "bmo", at: TODAY } })]]);
    const kvEnv = { ...env, SUPPORT: { get: async (k: string) => kvStore.get(k) ?? null, put: async (k: string, v: string) => void kvStore.set(k, v) } };
    const read = async (path: string) => {
      const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), kvEnv, ctx);
      await Promise.all(waits); waits = [];
      return ((await r.json()) as any).events.filter((e: EarningsEvent) => e.s === "QQKS").map((e: EarningsEvent) => `${e.d}:${e.h}:${e.xf ?? ""}`);
    };
    expect(await read("/api/calendar?from=2026-11-23&to=2026-11-23")).toEqual([]);
    expect(await read("/api/calendar?from=2026-11-24&to=2026-11-24")).toEqual(["2026-11-24:bmo:1"]);
    expect(await read(WEEK)).toEqual(["2026-11-24:bmo:1"]);
  });

  it("with a cold cross-check (no Nasdaq), today's behaviour: the feed's projected day", async () => {
    cold = true;
    const t = await call("/api/ticker/QQKS");
    expect(t.next).toMatchObject({ date: "2026-11-23", session: "", projected: true });
    expect(t.next.feedDay).toBeUndefined();
    const r = await call(WEEK);
    expect(r.events.find((e: EarningsEvent) => e.s === "QQKS")).toMatchObject({ d: "2026-11-23", h: "" });
  });
});
