// "Why did it move?": honest clues, never invented news. Plus the Guess / Piggy coach.
import { describe, expect, it } from "vitest";
import core from "../../packs/core/pack.json" with { type: "json" };
import { buildWhyInput, KID_SECTOR, normalMove, reportInWindow, reportResult, whyMoved, WHY_HONEST, whyWhen, type WhyInput } from "../../shared/kidsWhy";
import { courseNext, guessReveal, piggyTip } from "../../shared/kidsCoach";
import { KID_COMPANIES, fkGrade } from "../../shared/kids";
import type { LessonPack } from "../../shared/kidsPacks";

const CORE = core as unknown as LessonPack;
const W = (o: Partial<WhyInput>): WhyInput => ({ s: "DIS", nick: "Disney", range: "1d", move: -1, market: null, sector: null, report: null, dividend: null, normal: 1.5, asOf: "2026-10-30", ...o });
const ids = (x: WhyInput, today = "2026-10-30") => whyMoved(x, today).causes.map((c) => c.id);

describe("whyMoved", () => {
  it("a small move with no news is a normal wiggle", () => expect(ids(W({ move: 0.4 }))).toEqual(["wiggle"]));
  it("report card day leads, with a hedged line for each outcome", () => {
    const r = whyMoved(W({ move: -5, report: { date: "2026-10-29", eA: 1.2, eE: 1 } }), "2026-10-30");
    expect(r.causes[0].id).toBe("report");
    expect(r.causes[0].line).toMatch(/beat .* may have hoped for even more/);
    expect(whyMoved(W({ move: 2, report: { date: "2026-10-30", eA: 1, eE: 1 } })).causes[0].line).toMatch(/matched/);
  });
  it("credits the whole market only as much as it moved", () => {
    expect(whyMoved(W({ move: -2, market: -1.8 })).causes[0].id).toBe("market");
    const r = whyMoved(W({ move: -8, market: -0.5 }));
    expect(r.causes[0].id).toBe("unknown");
    expect(r.causes.find((c) => c.id === "market")?.line).toMatch(/not nearly this much/);
  });
  it("says it was about the company when the market went the other way", () => expect(ids(W({ move: -2.5, market: 1.1 }))).toContain("company"));
  it("names the group only when it moved more than the market", () => {
    expect(ids(W({ move: 2.4, market: 0.5, sector: { etf: "RSPC", name: "x", move: 2.2 } }))).toContain("sector");
    expect(ids(W({ move: 2.4, market: 2.0, sector: { etf: "RSPC", name: "x", move: 2.1 } }))).not.toContain("sector");
  });
  it("a dividend cut-off explains a drop, never a rise", () => {
    expect(ids(W({ move: -1.9, dividend: { date: "2026-10-30", amount: 0.5, pct: 1.4 } }))[0]).toBe("dividend");
    expect(ids(W({ move: 1.9, dividend: { date: "2026-10-30", amount: 0.5, pct: 1.4 } }))).not.toContain("dividend");
  });
  it("a big move with no clue is honestly 'we're not sure', never an invented story", () => {
    const r = whyMoved(W({ move: 9.5 }));
    expect(r.causes.map((c) => c.id)).toEqual(["unknown"]);
    expect(r.honest).toBe(WHY_HONEST);
  });
  it("time words are always true: today, a weekday, or the past week", () => {
    expect(whyWhen("1d", "2026-10-30", "2026-10-30")).toBe("today");
    expect(whyWhen("1d", "2026-10-30", "2026-11-01")).toBe("on Friday");
    expect(whyWhen("5d", "2026-10-30", "2026-10-30")).toBe("over the past week");
  });
  it("every line a kid can see reads at grade 7 or below and never advises", () => {
    const cases = [W({ move: 0.3 }), W({ move: -5, report: { date: "2026-10-29", eA: 1.2, eE: 1 } }), W({ move: 3, report: { date: "2026-10-29", eA: 0.8, eE: 1 } }), W({ move: -2, market: -1.8, sector: { etf: "RSPC", name: "the TV, games and internet companies", move: -3 } }), W({ move: -2.5, market: 1.1 }), W({ move: -1.9, dividend: { date: "2026-10-30", amount: 0.5, pct: 1.4 } }), W({ move: 9 })];
    for (const c of cases) {
      const r = whyMoved(c, "2026-10-30");
      for (const t of [r.headline, r.sizeLine, ...r.causes.map((x) => `${x.title}. ${x.line}`), r.honest]) {
        expect(fkGrade(t), t).toBeLessThanOrEqual(7);
        expect(t).not.toMatch(/\bbuy\b|\bsell\b|will go|guarantee/i);
      }
    }
  });
  it("every kid company has a group", () => { for (const c of KID_COMPANIES) expect(KID_SECTOR[c.s], c.s).toBeTruthy(); });
});

describe("building the input", () => {
  it("in line vs beat vs miss uses a small tolerance", () => {
    expect(reportResult(1, 1)).toBe("inline");
    expect(reportResult(1.004, 1)).toBe("inline");
    expect(reportResult(1.02, 1)).toBe("beat");
    expect(reportResult(0.98, 1)).toBe("miss");
  });
  it("a report counts only when its first trading reaction is in the window", () => {
    expect(reportInWindow("2026-10-29", "amc", "2026-10-29", "2026-10-30")).toBe(true);
    expect(reportInWindow("2026-10-29", "bmo", "2026-10-29", "2026-10-30")).toBe(false);
    expect(reportInWindow("2026-10-30", "amc", "2026-10-29", "2026-10-30")).toBe(false);
    expect(reportInWindow("2026-10-30", "bmo", "2026-10-29", "2026-10-30")).toBe(true);
  });
  it("measures the stock, the market and the group over the same dates", () => {
    const stock = { d: ["a", "b", "c"], c: [100, 100, 95] };
    const spy = { d: ["a", "b"], c: [500, 495] }; // stale by a day: no market number rather than a wrong one
    const x = buildWhyInput({ s: "DIS", nick: "Disney", range: "1d", stock, spy, sector: null, reports: [], dividends: [] });
    expect(x.move).toBe(-5);
    expect(x.market).toBeNull();
  });
  it("normal move is the mean absolute k-day move", () => {
    const s = { d: Array.from({ length: 21 }, (_, i) => String(i)), c: Array.from({ length: 21 }, (_, i) => (i % 2 ? 101 : 100)) };
    expect(normalMove(s, 1)).toBeCloseTo(1, 0);
  });
});

describe("coach", () => {
  it("walks the Guess course in order", () => {
    expect(courseNext(CORE.guess!.ladder, [])?.id).toBe("report-card");
    expect(courseNext(CORE.guess!.ladder, CORE.guess!.ladder)).toBeNull();
  });
  it("reveals with hedged lines, and in line is not a beat", () => {
    expect(guessReveal(CORE.guess!, { eA: 1.2, eE: 1, move: -2 })).toBe(CORE.guess!.reveal.beatDown);
    expect(guessReveal(CORE.guess!, { eA: 1, eE: 1.004, move: 1 })).toBe(CORE.guess!.reveal.inLine);
  });
  it("the piggy tip favors calm habits: too many peeks first, then big moves, then baskets", () => {
    const base = { holdings: 3, started: "2026-10-01", today: "2026-10-31", value: 1000, start: 1000, peeks: 0 };
    expect(piggyTip(CORE.piggy!, { ...base, peeks: 9 }).key).toBe("peekMany");
    expect(piggyTip(CORE.piggy!, { ...base, value: 850 }).text).toContain("15%");
    expect(piggyTip(CORE.piggy!, { ...base, holdings: 1 }).key).toBe("oneBasket");
    expect(piggyTip(CORE.piggy!, { ...base, started: "2026-10-29" }).key).toBe("newBank");
  });
});
