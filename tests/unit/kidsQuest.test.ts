import { describe, expect, it } from "vitest";
import { badgesFor, fkGrade, pointsFor } from "../../shared/kids";
import { KID_TERMS, QUEST } from "../../shared/kidsContent";

const strings = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(strings) : []);

describe("learn by doing: words and the lemonade stand", () => {
  it("every tap-a-word card is short, simple and has an example", () => {
    for (const [k, t] of Object.entries(KID_TERMS)) {
      expect(t.emoji, k).toBeTruthy();
      const text = `${t.means} ${t.example}`;
      expect(fkGrade(text), `${k}: ${text}`).toBeLessThanOrEqual(5);
      expect(t.means.split(/\s+/).length, k).toBeLessThanOrEqual(18);
    }
  });
  it("covers the words kids meet on story, guess and piggy cards", () => {
    for (const k of ["company", "share", "profit", "price", "report", "beat", "miss", "guess", "stock", "mood"]) expect(KID_TERMS).toHaveProperty(k);
  });
  it("every quest line stays at reading grade 5 or below", () => {
    for (const s of strings(QUEST)) if (s.split(/\s+/).length > 4) expect(fkGrade(s), s).toBeLessThanOrEqual(5);
  });
  it("finishing the quest earns the Lemonade Boss badge and 15 points", () => {
    const base = { guesses: [], lessons: [], piggy: false, piggyCount: 0 };
    expect(badgesFor({ ...base, quest: true }, 9)).toContain("lemonade");
    expect(badgesFor(base, 9)).not.toContain("lemonade");
    expect(pointsFor({ ...base, quest: true }) - pointsFor(base)).toBe(15);
  });
});
