import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { EarningsEvent, MacroResponse, TickerResponse } from "../../shared/types";
import { coreName, extractTickers, questionsFor, redFlags } from "../../src/lib/hype";
import { pickStories } from "../../src/lib/stories";
import { moodPlain, movePlain, whatTheyDo, whenPlain } from "../../shared/plain";
import { storyMacroSvg, storyMoodSvg, storyTickerSvg } from "../../shared/story";
import { UNIVERSE } from "../../src/lib/data";

const NVDA = JSON.parse(readFileSync(new URL("../fixtures/ticker-NVDA.json", import.meta.url), "utf8")) as TickerResponse;
const clone = (patch: (t: TickerResponse) => void) => { const t = structuredClone(NVDA); patch(t); return t; };

describe("extractTickers", () => {
  it("reads cashtags and company names from a TikTok caption, in order", () => {
    expect(extractTickers("Everyone on TikTok is buying $NVDA and Palantir 🚀", UNIVERSE)).toEqual(["NVDA", "PLTR"]);
  });
  it("ignores noise words that look like tickers", () => {
    expect(extractTickers("The CEO said the USA AI IPO market is HOT, DYOR NFA", UNIVERSE)).toEqual([]);
  });
  it("accepts bare uppercase tickers we track, and a lone lowercase query", () => {
    expect(extractTickers("AMD vs INTC — who wins?", UNIVERSE)).toEqual(["AMD", "INTC"]);
    expect(extractTickers("pltr", UNIVERSE)).toEqual(["PLTR"]);
  });
  it("maps everyday names to tickers (Google, Disney, Coke)", () => {
    expect(extractTickers("google disney and coke are my picks", UNIVERSE)).toEqual(["GOOGL", "DIS", "KO"]);
  });
  it("keeps unknown cashtags so we can flag them, and caps at 3", () => {
    const out = extractTickers("$ZZZZ $AAPL $MSFT $AMZN $TSLA", UNIVERSE);
    expect(out).toEqual(["ZZZZ", "AAPL", "MSFT"]);
  });
  it("reads tickers from quote URLs", () => {
    expect(extractTickers("https://finance.yahoo.com/quote/NFLX/ wow", UNIVERSE)).toContain("NFLX");
  });
  it("dedupes a stock mentioned by ticker and name", () => {
    expect(extractTickers("$TSLA Tesla TSLA", UNIVERSE)).toEqual(["TSLA"]);
  });
  it("coreName strips legal suffixes and skips generic first words", () => {
    expect(coreName("Palantir Technologies Inc.")).toEqual({ full: "palantir technologies", first: "palantir" });
    expect(coreName("General Motors Company").first).toBeNull();
  });
});

describe("redFlags", () => {
  it("flags an unknown symbol even without data", () => {
    expect(redFlags(null, { tracked: false }).map((f) => f.key)).toEqual(["unknown"]);
  });
  it("flags losses, big earnings swings and heavy debt from real numbers", () => {
    const t = clone((x) => {
      x.quarters = [{ period: "2026-06-30", eps: -0.4, rev: 1e9, gm: 40, om: -12 }];
      x.expectedMove = 11.2;
      const health = x.compass.factors.find((f) => f.key === "health")!;
      health.inputs = [{ label: "Debt / equity", value: "3.40×" }];
    });
    const keys = redFlags(t, { tracked: true }).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["unprofitable", "swingy", "debt"]));
  });
  it("flags a hot run near the yearly high", () => {
    const t = clone((x) => { x.spark = Array.from({ length: 126 }, (_, i) => (i < 62 ? 100 : 100 + (i - 62) * 1.2)); x.setup.from52wHigh = -2; });
    expect(redFlags(t, { tracked: true }).some((f) => f.key === "hot")).toBe(true);
  });
  it("notes an imminent report as info, not a red flag", () => {
    const t = clone((x) => { x.next = { ...x.next!, date: "2026-11-03" }; });
    const soon = redFlags(t, { tracked: true, today: "2026-10-31" }).find((f) => f.key === "soon")!;
    expect(soon.tone).toBe("info");
    expect(soon.label).toBe("Reports in 3 days");
  });
  it("every flag explains itself in plain words", () => {
    for (const f of redFlags(clone((x) => { x.expectedMove = 12; }), { tracked: false })) expect(f.why.length).toBeGreaterThan(20);
  });
  it("questionsFor always returns exactly 3, shaped by the flags", () => {
    const qs = questionsFor([{ key: "unprofitable", tone: "red", label: "", why: "" }], "Acme");
    expect(qs).toHaveLength(3);
    expect(qs[0]).toMatch(/make money/);
    expect(questionsFor([], "Acme")).toHaveLength(3);
  });
});

describe("pickStories", () => {
  const ev = (s: string, d: string, t: 0 | 1 = 1): EarningsEvent => ({ s, d, h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: null, rA: null, t });
  const macro = { mood: { score: 40, label: "Fear", components: [], history: [] }, events: [
    { key: "jobs", name: "Jobs report", date: "2026-11-06", kind: "jobs", blurb: "b" },
    { key: "fomc", name: "FOMC decision", date: "2026-11-05", kind: "fed", blurb: "b" },
  ], holidays: [], asOf: "", warnings: [] } as MacroResponse;
  const events = [ev("AAPL", "2026-11-02"), ev("NVDA", "2026-11-05"), ev("DIS", "2026-11-04"), ev("MSFT", "2026-11-03"), ev("OLD", "2026-10-29")];
  const base = { events, macro, today: "2026-10-31", horizon: "2026-11-09", mcap: (s: string) => UNIVERSE[s]?.mc ?? 0, heldVia: () => [] };

  it("orders: mood, her names first, the biggest macro event, then the CTA", () => {
    const s = pickStories({ ...base, watch: [{ s: "DIS", added: "" }], holdings: [{ s: "MSFT", v: 1000 }] });
    expect(s.map((x) => x.kind)).toEqual(["mood", "report", "report", "report", "macro", "cta"]);
    const reps = s.filter((x) => x.kind === "report") as Extract<(typeof s)[number], { kind: "report" }>[];
    expect(reps.map((r) => [r.e.s, r.why])).toEqual([["MSFT", "owned"], ["DIS", "watch"], ["AAPL", "big"]]);
    expect((s.find((x) => x.kind === "macro") as { m: { key: string } }).m.key).toBe("fomc");
  });
  it("counts funds she owns (look-through) above strangers", () => {
    const s = pickStories({ ...base, watch: [], holdings: [{ s: "VOO", v: 10000 }], heldVia: (sym) => (sym === "NVDA" ? [{ etf: "VOO", dollars: 700 }] : []) });
    const first = s.find((x) => x.kind === "report") as { e: EarningsEvent; why: string; via?: string };
    expect([first.e.s, first.why, first.via]).toEqual(["NVDA", "fund", "VOO"]);
  });
  it("skips past reports and untracked strangers", () => {
    const s = pickStories({ ...base, events: [...events, ev("TINY", "2026-11-02", 0)], watch: [], holdings: [] });
    const syms = s.filter((x) => x.kind === "report").map((x) => (x as { e: EarningsEvent }).e.s);
    expect(syms).not.toContain("OLD");
    expect(syms).not.toContain("TINY");
  });
});

describe("plain English", () => {
  it("whatTheyDo turns an industry into a sentence", () => {
    expect(whatTheyDo("NVIDIA Corporation", "Semiconductors")).toBe("NVIDIA designs or makes computer chips.");
    expect(whatTheyDo("Acme Inc.", null)).toBe("Acme is a publicly traded company.");
  });
  it("whenPlain says tomorrow / weekday / date", () => {
    expect(whenPlain("2026-11-01", "amc", "2026-10-31")).toBe("tomorrow after the market closes");
    expect(whenPlain("2026-11-04", "bmo", "2026-10-31")).toBe("Wednesday before the market opens");
    expect(whenPlain("2026-11-17", "amc", "2026-10-31")).toBe("on Nov 17 after the market closes");
  });
  it("moodPlain and movePlain avoid jargon", () => {
    expect(moodPlain(40).headline).toBe("Investors are nervous");
    expect(movePlain(4.8)).toMatch(/noticeable swing/);
    expect(movePlain(null)).toMatch(/enough past reports/);
  });
});

describe("story cards (9:16)", () => {
  it("ticker card is 1080×1920 with the facts and the URL footer", () => {
    const svg = storyTickerSvg({ symbol: "NVDA", name: "NVIDIA Corporation", does: "NVIDIA designs or makes computer chips.", when: "on Nov 17 after the market closes", session: "amc", epsE: 2.53, move: 4.8, grade: "B+", beats: 4, total: 4 });
    expect(svg).toContain('width="1080" height="1920"');
    for (const s of ["NVDA", "$2.53 a share", "±4.8%", "B+ · 4 of 4", "MUTAAFAZIZ.COM/METAPHASES"]) expect(svg).toContain(s);
  });
  it("mood and macro cards escape text safely", () => {
    expect(storyMoodSvg(40, "Investors are nervous", "Careful <now> & then")).toContain("Careful &lt;now&gt; &amp; then");
    expect(storyMacroSvg("FOMC decision", "Wednesday", "Rates & you")).toContain("Rates &amp; you");
  });
});
