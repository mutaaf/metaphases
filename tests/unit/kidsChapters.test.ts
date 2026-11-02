import { describe, expect, it } from "vitest";
import { badgesFor, fkGrade, KID_BY_SYMBOL, pointsFor } from "../../shared/kids";
import { KID_TERMS } from "../../shared/kidsContent";
import {
  CH_STAGES, chaptersDone, DIV, DIV_CARDS, DIV_CHECK, jarPath, nextChapter, SAVE, SAVE_CHECK, snowball, SORT_ITEMS, TREE_YEARS, treePath,
} from "../../shared/kidsQuestContent";

const strings = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(strings) : []);

describe("quest chapters 2 + 3: reading level", () => {
  it("every Save or Grow? and dividend line stays at grade 5 or below", () => {
    const all = [...strings(SAVE), ...strings(DIV), ...SORT_ITEMS.flatMap((i) => [i.text, i.why]), ...[...SAVE_CHECK, ...DIV_CHECK].flatMap((q) => [q.q, q.why, ...q.options])];
    for (const s of all) if (s.split(/\s+/).length > 4) expect(fkGrade(s), s).toBeLessThanOrEqual(5);
  });
  it("new word cards are simple and jump into the right chapter stage", () => {
    for (const k of ["saving", "investing", "interest", "dividend"] as const) {
      const t = KID_TERMS[k];
      expect(fkGrade(`${t.means} ${t.example}`), k).toBeLessThanOrEqual(5);
      expect(t.play).toMatch(/^(save|dividends):/);
      const [c, s] = t.play.split(":");
      expect((CH_STAGES as Record<string, readonly string[]>)[c]).toContain(s);
    }
  });
});

describe("the money math is fixed and honest", () => {
  it("the jar grows 2% a year and never goes down", () => {
    const p = jarPath(10);
    expect(p[0]).toBe(10);
    expect(p[1]).toBe(10.2);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    expect(p[10]).toBeCloseTo(12.19, 1);
  });
  it("the money tree has two down years (one -15%), averages about 7% and beats the jar over 10 years", () => {
    expect(TREE_YEARS.filter((r) => r < 0)).toHaveLength(2);
    expect(Math.min(...TREE_YEARS)).toBe(-15);
    const p = treePath(10);
    const cagr = (Math.pow(p[10] / p[0], 1 / 10) - 1) * 100;
    expect(cagr).toBeGreaterThan(6.5);
    expect(cagr).toBeLessThan(7.5);
    expect(p.filter((v, i) => i > 0 && v < p[i - 1])).toHaveLength(2);
    expect(p[10]).toBeGreaterThan(jarPath(10)[10]);
  });
  it("replanting dividends snowballs past spending them", () => {
    const sb = snowball(6);
    expect(sb.spend[6]).toEqual({ spent: 24, slices: 4, pay: 4 });
    expect(sb.replant[1].slices).toBe(4.8);
    expect(sb.replant[6].slices).toBeCloseTo(11.94, 1);
    for (let i = 1; i <= 6; i++) expect(sb.replant[i].pay).toBeGreaterThan(sb.replant[i - 1].pay);
  });
});

describe("chapters, badges and points", () => {
  const base = { guesses: [], lessons: [], piggy: false, piggyCount: 0 };
  it("a chapter is done when every stage is done", () => {
    expect(chaptersDone([], false)).toEqual([]);
    expect(chaptersDone(["company", "shares", "price", "report"], false)).toEqual(["lemonade"]);
    expect(chaptersDone(["save:jar", "save:tree", "save:choose"], true)).toEqual(["lemonade"]);
    expect(chaptersDone(["save:jar", "save:tree", "save:choose", "save:check", ...CH_STAGES.dividends.map((s) => `dividends:${s}`)], true)).toEqual(["lemonade", "save", "dividends"]);
    expect(nextChapter(["lemonade"])?.id).toBe("save");
    expect(nextChapter(["lemonade", "save", "dividends"])).toBeNull();
  });
  it("Smart Saver and Dividend Detective badges, +15 points each", () => {
    expect(badgesFor({ ...base, chapters: ["save"] }, 9)).toContain("smart-saver");
    expect(badgesFor({ ...base, chapters: ["dividends"] }, 9)).toContain("dividend-detective");
    expect(badgesFor(base, 9)).not.toContain("smart-saver");
    expect(pointsFor({ ...base, quest: true, chapters: ["lemonade", "save", "dividends"] })).toBe(45);
    expect(pointsFor({ ...base, chapters: ["lemonade"] })).toBe(15);
  });
  it("dividend cards are companies kids know", () => {
    for (const c of DIV_CARDS) expect(KID_BY_SYMBOL[c.s], c.s).toBeTruthy();
    expect(DIV_CARDS.filter((c) => c.pays).map((c) => c.s).sort()).toEqual(["HSY", "KO", "MCD", "PEP", "WMT"]);
  });
});
