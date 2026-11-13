import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { eventTimeContested, nextTimeContested, settleContested, shownSession } from "../../shared/contestedTime";
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { windowDays } from "../../shared/crossCheck";
import { eventProjected } from "../../shared/projected";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";

// 0062: when Finnhub and Nasdaq list the same date in different sessions (DE, ROAD: Finnhub "amc", Nasdaq "bmo"),
// no surface headlines either session as fact. Made-up symbols (LESSONS 2026-11-06), except ROAD's override.

const row = (o: Partial<EarningsEvent> = {}): EarningsEvent => ({ s: "ZZCT", d: "2026-11-25", h: "amc", q: 4, y: 2026, eE: 4.17, eA: null, rE: null, rA: null, t: 0, ...o });

describe("eventTimeContested / settleContested", () => {
  it("same date, both sessions named and different: contested, shown as Time TBD with the feed's kept", () => {
    const e = row({ x: "differs", xd: "2026-11-25", xh: "bmo" });
    expect(eventTimeContested(e)).toBe(true);
    expect(settleContested(e)).toMatchObject({ h: "", fh: "amc", xh: "bmo", x: "differs" });
    expect(eventTimeContested(settleContested(e))).toBe(false); // idempotent
  });
  it("a date disagreement, an agreeing row, a blank Nasdaq session, a company date: left alone", () => {
    for (const e of [
      row({ x: "differs", xd: "2026-11-24", xh: "bmo" }),
      row({ x: "agree", xh: "amc" }),
      row({ x: "differs", xd: "2026-11-25" }),
      row({ x: "differs", xd: "2026-11-25", xh: "bmo", o: "https://example.com/release" }),
      row(),
    ]) {
      expect(eventTimeContested(e)).toBe(false);
      expect(settleContested(e)).toBe(e);
    }
  });
  it("a contested row isn't called projected for want of a time: both feeds agree on the date", () => {
    const e = settleContested(row({ x: "differs", xd: "2026-11-25", xh: "bmo" }));
    expect(eventProjected(e, "2026-11-13")).toBe(false);
    expect(eventProjected(row({ h: "" }), "2026-11-13")).toBe(true); // a plain blank session still is
  });
});

describe("nextTimeContested / shownSession (the sheet)", () => {
  const next = { date: "2026-11-25", session: "amc" as const, nasdaq: { date: "2026-11-25", session: "bmo" as const } };
  it("DE-shaped: no session headlined", () => {
    expect(nextTimeContested(next)).toBe(true);
    expect(shownSession(next)).toBe("");
    expect(tickerShareTitle("ZZCT", "Z", { ...next, quarter: 4 })).toBe("ZZCT reports Wed, Nov 25, time unconfirmed · Metaphases");
  });
  it("a date disagreement or an uncontested next keeps the feed's session", () => {
    expect(nextTimeContested({ ...next, nasdaq: { date: "2026-11-24", session: "bmo" } })).toBe(false);
    expect(shownSession({ date: "2026-11-25", session: "amc" })).toBe("amc");
    expect(shownSession({ ...next, confirmed: "https://example.com" })).toBe("amc");
    expect(shownSession(null)).toBe("");
  });
});

describe("ROAD override (Construction Partners, Nov 5)", () => {
  const FILE = overridesFile as unknown as DateOverrides;
  it("passes the gate on the day it was added, date only: a call time isn't a session", () => {
    expect(validateOverrides({ ROAD: FILE.ROAD }, "2026-11-12")).toEqual([]);
    expect(FILE.ROAD).toMatchObject({ date: "2026-11-19", quarter: 4, year: 2026 });
    expect(FILE.ROAD.hour).toBeUndefined();
  });
  it("Finnhub's Nov 19 after-the-close row becomes Nov 19, session unknown, source set", () => {
    const out = applyToRows("ROAD", [{ symbol: "ROAD", date: "2026-11-19", hour: "amc", quarter: 4, year: 2026, epsEstimate: 1.09 }], FILE, "2026-11-13");
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-19", hour: "" })]);
    expect(out[0].source).toMatch(/^https:\/\//);
    const title = tickerShareTitle("ROAD", "Construction Partners", { date: "2026-11-19", session: "", quarter: 4, year: 2026 } as never);
    expect(title).not.toMatch(/after the close/);
  });
});

// /api/ics reads the cached 0015 window and doesn't state a contested session.
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const TODAY = "2026-11-13";
const CAL = (key: string) => `https://cache.metaphases.internal/${encodeURIComponent(key)}`;

describe("/api/ics on a contested session", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    const cache = new MemCache();
    cache.store.set(CAL(`nq:x:idx:v1:${TODAY}`), JSON.stringify({ from: TODAY, to: "2026-11-26", loaded: windowDays(TODAY), idx: { ZZCT: [{ d: "2026-11-25", h: "bmo" }], ZZAG: [{ d: "2026-11-24", h: "amc" }] } }));
    (globalThis as any).caches = { default: cache };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      const sym = url.searchParams.get("symbol");
      if (url.pathname.endsWith("/calendar/earnings") && sym === "ZZCT") return new Response(JSON.stringify({ earningsCalendar: [{ symbol: "ZZCT", date: "2026-11-25", hour: "amc", quarter: 4, year: 2026, epsEstimate: 4.17 }] }));
      if (url.pathname.endsWith("/calendar/earnings") && sym === "ZZAG") return new Response(JSON.stringify({ earningsCalendar: [{ symbol: "ZZAG", date: "2026-11-24", hour: "amc", quarter: 3, year: 2026, epsEstimate: 1 }] }));
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("the contested row names no session; an agreeing one keeps its own", async () => {
    const r = await worker.fetch(new Request("https://mutaafaziz.com/metaphases/api/ics?s=ZZCT,ZZAG"), env, ctx);
    const text = (await r.text()).replace(/\r?\n /g, "");
    expect(text).toContain("SUMMARY:ZZCT earnings · time not yet confirmed");
    expect(text).not.toContain("SUMMARY:ZZCT earnings · after the close");
    expect(text).toContain("SUMMARY:ZZAG earnings · after the close");
  });
});

describe("the AI ticker prompt", () => {
  it("never hands the model a contested session as fact", async () => {
    const { readFileSync } = await import("node:fs");
    const { buildMessages } = await import("../../worker/ai/prompts");
    const { tickerContext } = await import("../../src/lib/aiContext");
    const t = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8"));
    t.next = { ...t.next, date: "2026-11-25", session: "amc", nasdaq: { date: "2026-11-25", session: "bmo" } };
    const text = buildMessages({ task: "ticker", context: tickerContext(t) }).map((m) => m.content).join("\n");
    expect(text).toMatch(/on 2026-11-25 time unconfirmed/);
    expect(text).not.toMatch(/on 2026-11-25 amc/);
  });
});
