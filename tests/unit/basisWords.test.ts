import { describe, expect, it } from "vitest";
import { basisFootnote, surpriseWords } from "../../shared/basisWords";

// 0094: a judged quarter with no percentage says what happened; the "basis differs" note names FFO only for a REIT.
describe("surpriseWords (0094)", () => {
  it("turnarounds and losses in words", () => {
    expect(surpriseWords({ epsE: -0.19, epsA: 0.1, surprisePct: null })).toBe("turned a profit");
    expect(surpriseWords({ epsE: -0.14, epsA: -0.06, surprisePct: null })).toBe("smaller loss");
    expect(surpriseWords({ epsE: -0.14, epsA: -0.2, surprisePct: null })).toBe("bigger loss");
    expect(surpriseWords({ epsE: 0.04, epsA: -0.31, surprisePct: null })).toBe("posted a loss");
    expect(surpriseWords({ epsE: -0.05, epsA: 0, surprisePct: null })).toBe("broke even");
    expect(surpriseWords({ epsE: -0, epsA: -0.02, surprisePct: null })).toBe("posted a loss");
    expect(surpriseWords({ epsE: 0, epsA: 0.03, surprisePct: null })).toBe("beat");
  });
  it("a small same-sign base: beat or missed, never a blank", () => {
    expect(surpriseWords({ epsE: 0.02, epsA: 0.13, surprisePct: null })).toBe("beat");
    expect(surpriseWords({ epsE: 0.25, epsA: 0.05, surprisePct: null })).toBe("missed");
    expect(surpriseWords({ epsE: -0.1, epsA: -0.1, surprisePct: null })).toBe("beat");
  });
  it("nothing when a percentage exists, the basis differs, or a figure is missing", () => {
    expect(surpriseWords({ epsE: 0.55, epsA: 1.28, surprisePct: 132.7 })).toBeNull();
    expect(surpriseWords({ epsE: -0.19, epsA: 0.1, surprisePct: null, basis: "differs" })).toBeNull();
    expect(surpriseWords({ epsE: null, epsA: 0.1, surprisePct: null })).toBeNull();
  });
});

describe("basisFootnote (0094)", () => {
  it("a non-REIT (US or foreign) never reads FFO or ADR", () => {
    const t = basisFootnote(false);
    expect(t).not.toMatch(/FFO|ADR/);
    expect(t).toContain("different measures");
  });
  it("a REIT names FFO", () => expect(basisFootnote(true)).toContain("FFO"));
});
