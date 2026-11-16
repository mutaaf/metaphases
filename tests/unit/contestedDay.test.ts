import { describe, expect, it } from "vitest";
import { contestedDay, splitClosed, unconfirmedRow } from "../../shared/closedRows";
import { figuresPending, tickerShareTitle } from "../../shared/pending";
import { factsFor } from "../../worker/ai/prompts";
import { redFlags } from "../../src/lib/hype";
import { pickStories } from "../../src/lib/stories";
import { weekContext } from "../../src/lib/aiContext";
import type { EarningsEvent, TickerResponse } from "../../shared/types";
import { readFileSync } from "node:fs";

// 0078: PDD on Mon Nov 16: the feed's day, before the open, no figures, while Nasdaq lists Thu Nov 19 and PDD
// hasn't announced. Not a report day: not "figures pending", not counted as reporting, filed as unconfirmed.
const TODAY = "2026-11-16";
const AT_19Z = 14 * 60; // 2 PM in New York
const pdd: EarningsEvent = { s: "PDD", d: TODAY, h: "bmo", q: 3, y: 2026, eE: 19.21, eA: null, rE: 1.17e11, rA: null, t: 1, x: "differs", xd: "2026-11-19", xh: "bmo" };

describe("contestedDay (0078)", () => {
  it("a PDD-shaped row on its feed day is contested: not figures pending, not counted as reporting", () => {
    expect(contestedDay(pdd, TODAY)).toBe(true);
    expect(figuresPending(pdd, TODAY, AT_19Z)).toBe(false);
    const aapl: EarningsEvent = { ...pdd, s: "AAPL", x: undefined, xd: undefined, xh: undefined };
    const { dated, unconfirmed } = splitClosed([pdd, aapl], TODAY);
    expect(dated.map((e) => e.s)).toEqual(["AAPL"]);
    expect(unconfirmed.map((e) => e.s)).toEqual(["PDD"]);
  });

  it("the same row with a company date (o) is a report day: results pending as before", () => {
    const dated = { ...pdd, o: "https://investor.example.com", x: undefined, xd: undefined, xh: undefined };
    expect(contestedDay({ ...pdd, o: "https://investor.example.com" }, TODAY)).toBe(false);
    expect(unconfirmedRow(dated, TODAY)).toBe(false);
    expect(figuresPending(dated, TODAY, AT_19Z)).toBe(true);
  });

  it("stays contested in the days after, until figures arrive", () => {
    expect(contestedDay(pdd, "2026-11-17")).toBe(true);
    expect(contestedDay({ ...pdd, eA: 2.1 }, "2026-11-17")).toBe(false);
  });

  it("is not contested before its day, on a same-day session contest, or without today", () => {
    expect(contestedDay(pdd, "2026-11-13")).toBe(false); // still ahead: the usual "Nasdaq: …" mark
    expect(contestedDay({ ...pdd, xd: TODAY, xh: "amc" }, TODAY)).toBe(false); // 0062's case
    expect(unconfirmedRow(pdd)).toBe(false); // callers that don't pass today keep 0064/0072 only
  });

  it("the share title names both dates, never 'results expected'", () => {
    const title = tickerShareTitle("PDD", "PDD Holdings", { date: TODAY, session: "bmo", quarter: 3, nasdaq: { date: "2026-11-19", session: "bmo" } });
    expect(title).toBe("PDD reports Mon, Nov 16 (unconfirmed; Nasdaq lists Thu, Nov 19) · Metaphases");
    expect(title).not.toMatch(/expected/);
  });
});


describe("AI facts for a contested report day (0078)", () => {
  it("name both dates and never say results were expected that day", () => {
    const facts = factsFor("ticker", { symbol: "PDD", name: "PDD Holdings", next: { date: TODAY, session: "bmo", quarter: 3, year: 2026, epsE: 19.21, revE: 1.17e11, currency: "CNY", nasdaq: { date: "2026-11-19", session: "bmo" } } }).join("\n");
    expect(facts).toMatch(/date unconfirmed \(our feed says 2026-11-16, Nasdaq's calendar lists 2026-11-19/);
    expect(facts).not.toMatch(/results were expected on 2026-11-16/);
  });
});


describe("other surfaces on a contested report day (0078)", () => {
  const NVDA = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8")) as TickerResponse;

  it("Hype Check doesn't say 'Reports today' for a feed day Nasdaq contests", () => {
    const t = structuredClone(NVDA);
    t.next = { ...t.next!, date: TODAY, nasdaq: { date: "2026-11-19", session: "bmo" } };
    expect(redFlags(t, { tracked: true, today: TODAY }).find((f) => f.key === "soon")).toBeUndefined();
    t.next = { ...t.next!, nasdaq: undefined };
    expect(redFlags(t, { tracked: true, today: TODAY }).find((f) => f.key === "soon")?.label).toBe("Reports today");
  });

  it("Today's stories don't feature it as a report today", () => {
    const s = pickStories({ events: [pdd], macro: null, watch: [{ s: "PDD", added: "" }], holdings: [], today: TODAY, horizon: "2026-11-23", nowMin: AT_19Z, mcap: () => 1, heldVia: () => [] });
    expect(s.some((x) => x.kind === "report")).toBe(false);
  });

  it("the AI week context names Nasdaq's day and doesn't count it as reporting", () => {
    const c = weekContext([pdd], null, TODAY, "2026-11-20", TODAY);
    expect(c.total).toBe(0);
    expect(c.events[0]).toMatchObject({ s: "PDD", xd: "2026-11-19" });
    expect(factsFor("week", c).join("\n")).toMatch(/date unconfirmed: Nasdaq's calendar lists 2026-11-19/);
  });
});
