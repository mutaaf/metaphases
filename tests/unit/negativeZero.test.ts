import { describe, expect, it } from "vitest";
import { epsIn, moneyIn, readEstimate } from "../../shared/currency";
import { eps } from "../../src/lib/format";
import { tickerShareDesc } from "../../shared/reported";
import { factsFor } from "../../worker/ai/prompts";

// 0089: Kohl's Street EPS estimate is -0.0017; the sheet tile and the unfurl read "-$0.00".
describe("a figure that rounds to zero never carries a minus sign (0089)", () => {
  it("epsIn drops the sign when the value rounds to 0.00, and keeps it from -0.005 down", () => {
    expect(epsIn(-0.0017, "USD")).toBe("$0.00");
    expect(epsIn(-0.0017, "USD").startsWith("-")).toBe(false);
    expect(epsIn(-0.0049, "JPY")).toBe("¥0.00");
    expect(epsIn(-0.0017, "")).toBe("0.00 (local currency)");
    expect(epsIn(-0, "USD")).toBe("$0.00");
    expect(epsIn(-0.006, "USD")).toBe("-$0.01");
    expect(epsIn(-0.9624, "CNY")).toBe("-CN¥0.96");
  });
  it("the client's eps() and moneyIn() follow the same rule", () => {
    expect(eps(-0.0017)).toBe("$0.00");
    expect(eps(-0.006)).toBe("-$0.01");
    expect(moneyIn(-0.3, "USD")).toBe("$0");
    expect(moneyIn(-2e9, "USD")).toBe("-$2.0B");
  });
  it("the share description and The Read never say \"-$0.00\"", () => {
    const desc = tickerShareDesc("Kohl's", {
      next: { date: "2026-11-24", session: "bmo", quarter: 3, year: 2026, epsE: -0.0017, currency: "USD" } as never,
      justReported: null, beatRate: null, expectedMove: null, setup: { grade: null } as never, compass: { grade: null } as never,
    });
    expect(desc).toContain("Street expects $0.00 EPS");
    expect(desc).not.toContain("-$0.00");
    expect(readEstimate("Kohl's", -0.0017, "USD", 0.56)).not.toContain("-$0.00");
  });
  it("edges: -0.005 keeps its sign, NaN is a dash, local-currency amounts too", () => {
    expect(epsIn(-0.005, "USD")).toBe("-$0.01");
    expect(eps(Number.NaN)).toBe("—");
    expect(moneyIn(-0.3, "")).toBe("0 (local currency)");
  });
  it("the AI's past-report facts use the same formatter (no \"$-0.00\", no \"$-0.96\")", () => {
    const lines = factsFor("ticker", { symbol: "KSS", name: "Kohl's", history: [{ date: "2026-08-27", period: "Jul 2026", epsE: -0.0017, epsA: -0.96, surprisePct: 1, move: 2 }] });
    const past = lines.find((l) => l.startsWith("Past report"))!;
    expect(past).toContain("EPS est $0.00 vs actual -$0.96");
    expect(past).not.toMatch(/\$-|-\$0\.00/);
  });
});
