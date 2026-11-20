import { describe, expect, it } from "vitest";
import { basisFootnote, surpriseWords } from "../../src/lib/basisWords";

// 0094: a judged quarter with no percentage says what happened; the "basis differs" note names FFO and ADRs only where they apply.
describe("surpriseWords (0094)", () => {
  it("turnarounds and narrower losses in words", () => {
    expect(surpriseWords({ epsE: -0.19, epsA: 0.1, surprisePct: null })).toBe("turned a profit");
    expect(surpriseWords({ epsE: -0.14, epsA: -0.06, surprisePct: null })).toBe("smaller loss");
    expect(surpriseWords({ epsE: -0.14, epsA: -0.2, surprisePct: null })).toBe("bigger loss");
    expect(surpriseWords({ epsE: 0.04, epsA: -0.31, surprisePct: null })).toBe("posted a loss");
  });
  it("nothing when a percentage exists, the basis differs, or the base is merely small", () => {
    expect(surpriseWords({ epsE: 0.55, epsA: 1.28, surprisePct: 132.7 })).toBeNull();
    expect(surpriseWords({ epsE: -0.19, epsA: 0.1, surprisePct: null, basis: "differs" })).toBeNull();
    expect(surpriseWords({ epsE: 0.02, epsA: 0.13, surprisePct: null })).toBeNull();
  });
});

describe("basisFootnote (0094)", () => {
  it("a US non-REIT never reads FFO or ADR", () => {
    const t = basisFootnote(false, false);
    expect(t).not.toMatch(/FFO|ADR/);
    expect(t).toContain("different measures");
  });
  it("a REIT names FFO; a foreign filer names ADRs", () => {
    expect(basisFootnote(true, false)).toContain("FFO");
    expect(basisFootnote(false, true)).toContain("ADR");
  });
});
