import { describe, expect, it } from "vitest";
import { buildBrief } from "../../src/lib/brief";
import { exposureContext, weekContext } from "../../src/lib/aiContext";
import { factsFor } from "../../worker/ai/prompts";
import { dayShareText } from "../../shared/dayShare";

// 0067: a row the feed projects onto a market holiday (`c`) isn't a dated report anywhere: not in the AI's facts,
// not in the week brief's counts, not in the `?day=` unfurl. (0064 fixed the calendar, Compass and Today.)

const row = (s: string, d: string, h: "" | "bmo" | "amc" | "dmh", extra: Record<string, unknown> = {}) =>
  ({ s, d, h, q: 3, y: 2027, eE: 1, eA: null, rE: null, rA: null, t: 1, ...extra }) as any;
const co = (n: string, mc: number) => ({ n, logo: "", mc, ind: "", sec: "", c: "US", web: "", sp: true });
const WK = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
const VEEV = row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving" });
const DE = row("DE", "2026-11-25", "bmo");

describe("AI context", () => {
  it("the week context marks a holiday row unconfirmed, with no session, and doesn't count it", () => {
    const c = weekContext([VEEV, DE], null, WK[0], WK[4], "2026-11-16");
    expect(c.total).toBe(1);
    const v = c.events.find((e) => e.s === "VEEV")!;
    expect(v.h).toBe("");
    expect(v.cx).toBe("Thanksgiving");
    const line = factsFor("week", c).find((l) => l.includes("VEEV"))!;
    expect(line).toMatch(/date not confirmed/i);
    expect(line).toContain("Thanksgiving");
    expect(line).not.toMatch(/\bamc\b/);
    expect(line).not.toContain("2026-11-26");
    expect(factsFor("week", c).join("\n")).toContain("1 tracked companies report");
  });
  it("the exposure context marks the row unconfirmed and leaves it out of the week totals", () => {
    const c = exposureContext([VEEV, DE], [{ s: "VEEV", v: 1000 }, { s: "DE", v: 500 }], "2026-11-16");
    const v = c.rows.find((r) => r.s === "VEEV")!;
    expect(v.h).toBe("");
    expect(v.cx).toBe("Thanksgiving");
    expect(c.weeks.flatMap((w) => w.names)).toEqual(["DE"]);
    const line = factsFor("exposure", c).find((l) => l.includes("VEEV") && l.includes("exposed via"))!;
    expect(line).toMatch(/date not confirmed/i);
    expect(line).not.toMatch(/\bamc\b/);
  });
});

describe("week brief counts", () => {
  it("a holiday row isn't counted as reporting this week, but is reported as unconfirmed", () => {
    const b = buildBrief(WK, [VEEV, DE], [], null, { VEEV: co("Veeva", 40000), DE: co("Deere", 150000) }, "2026-11-16");
    expect(b.total).toBe(1);
    expect(b.tracked).toBe(1);
    expect(b.sp).toBe(1);
    expect(b.unconfirmed).toBe(1);
  });
  it("one of the ten largest on a holiday isn't in `largest.reporting`", () => {
    const U = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`B${i}`, co(`Big ${i}`, 1e6 - i)]));
    const b = buildBrief(WK, [row("B0", "2026-11-26", "amc", { c: "Thanksgiving" })], [], null, U, "2026-11-16");
    expect(b.largest.reporting).toEqual([]);
    expect(b.total).toBe(0);
  });
});

describe("week brief share classes", () => {
  it("a dated share class wins over another class's holiday projection", () => {
    const U = { GOOGL: co("Alphabet", 3000000), GOOG: co("Alphabet", 2999000) };
    const b = buildBrief(WK, [row("GOOGL", "2026-11-26", "amc", { c: "Thanksgiving" }), row("GOOG", "2026-11-25", "amc")], [], null, U, "2026-11-16");
    expect(b.tracked).toBe(1);
    expect(b.top.map((t) => t.s)).toEqual(["GOOG"]);
  });
});

describe("?day= unfurl", () => {
  it("a holiday says the market is closed and the dates aren't confirmed, with no report count", () => {
    const t = dayShareText("Thursday, November 26", "Thanksgiving", [], ["VEEV"]);
    expect(t.title).toBe("Market closed on Thursday, November 26 (Thanksgiving) · Metaphases");
    expect(t.title).not.toMatch(/\d+ earnings/);
    expect(t.desc).toContain("VEEV");
    expect(t.desc).toMatch(/not confirmed/);
    expect(t.desc).not.toMatch(/sorted by session/);
  });
  it("a holiday with no rows still says closed", () => {
    expect(dayShareText("Friday, December 25", "Christmas", [], []).title).toBe("Market closed on Friday, December 25 (Christmas) · Metaphases");
  });
  it("a company-dated row on a holiday stays named, never 'no company reports'", () => {
    const t = dayShareText("Thursday, November 26", "Thanksgiving", ["ZZHOL"], ["VEEV"]);
    expect(t.desc).toContain("ZZHOL has a company-given date here");
    expect(t.desc).toContain("VEEV");
    expect(t.desc).not.toMatch(/no company reports/);
  });
  it("an ordinary day is unchanged", () => {
    const t = dayShareText("Tuesday, November 24", null, ["A", "B", "C", "D", "E"], []);
    expect(t.title).toBe("5 earnings on Tuesday, November 24 · Metaphases");
    expect(t.desc).toBe("A, B, C, D and 1 more (5 in all) — sorted by session, with estimates, results and how each stock has reacted before.");
    expect(dayShareText("Tuesday, November 24", null, [], []).desc).toBe("A quiet day on the earnings calendar.");
  });
});
