import { describe, expect, it } from "vitest";
import { typicalMove, TYPICAL_MOVE_MIN } from "../../shared/reaction";

// 0088: TJX read "typical move ±8.0%" from one report (the five-report figure is about ±3.9%). A typical move is
// never an average of one or two reports: fewer than three measured moves give null ("—") everywhere.
describe("typicalMove", () => {
  it("needs at least three measured reports", () => {
    expect(TYPICAL_MOVE_MIN).toBe(3);
    expect(typicalMove([])).toBeNull();
    expect(typicalMove([8.05])).toBeNull();
    expect(typicalMove([8.05, -4.21])).toBeNull();
  });
  it("is the mean absolute move from three on", () => {
    expect(typicalMove([3, -3, 6])).toBeCloseTo(4, 6);
    expect(typicalMove([8.05, 0.16, -1.17, 5.66, -4.21])).toBeCloseTo(3.85, 2);
  });
});

describe("the AI facts without a typical move (0088)", () => {
  it("say there is none rather than leave one or two moves to be averaged", async () => {
    const { factsFor } = await import("../../worker/ai/prompts");
    const base = { symbol: "ZZTM", next: null, history: [{ date: "2026-11-18", period: "Q3 2026", epsE: 1, epsA: 1.1, surprisePct: 10, move: 8.05 }] };
    const none = factsFor("ticker", { ...base, expectedMove: null }).join("\n");
    expect(none).toContain("No typical move: fewer than 3 measured reports");
    expect(none).not.toMatch(/Typical stock move/);
    const some = factsFor("ticker", { ...base, expectedMove: 3.9 }).join("\n");
    expect(some).toContain("Typical stock move on a report: ±3.9%");
    expect(some).not.toContain("No typical move");
  });
});
