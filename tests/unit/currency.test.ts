import { describe, expect, it } from "vitest";
import { epsIn, estimateCurrency, moneyIn, readEstimate } from "../../shared/currency";
import { storyTickerSvg } from "../../shared/story";
import { cardSvg, buildIcs } from "../../shared/depth";
import { UNIVERSE, curOf } from "../../src/lib/data";

describe("estimateCurrency (0021)", () => {
  it("trusts Finnhub's estimateCurrency, including USD for a foreign company that files in dollars", () => {
    expect(estimateCurrency({ estimateCurrency: "JPY", country: "JP", epsE: 64.5 })).toBe("JPY");
    expect(estimateCurrency({ estimateCurrency: "RMB" })).toBe("CNY");
    expect(estimateCurrency({ estimateCurrency: "USD", country: "GB", epsE: 0.48, usdEps: [0.2, 0.36] })).toBe("USD");
  });
  it("uses the universe's known currency when Finnhub's profile is missing", () => {
    expect(estimateCurrency({ known: "CNY", country: "CN", epsE: -0.0116, usdEps: [-0.04, -0.03] })).toBe("CNY");
  });
  it("detects a non-USD basis by ratio against USD history (TM: 64.50 vs ≤ $7.57)", () => {
    expect(estimateCurrency({ country: "JP", epsE: 64.4986, usdEps: [7.57, 4, 6.26, 4.85] })).toBe("JPY");
    expect(estimateCurrency({ country: "TW", epsE: 32.224, usdEps: [4.6, 4.31, 3.49, 3.14] })).toBe("TWD");
    // Country with no known home currency → "" (not dollars, unknown).
    expect(estimateCurrency({ country: "ZZ", epsE: 50, usdEps: [2, 3] })).toBe("");
  });
  it("doesn't flag the profile's listing currency alone (SQM's profile currency is CLP; it files in USD)", () => {
    expect(estimateCurrency({ currency: "CLP", country: "CL", epsE: 0.7, usdEps: [2.31, 1.28] })).toBe("USD");
  });
  it("keeps USD for US companies and for tiny GAAP histories (ESTC 0.83 adj. vs 0.06 GAAP)", () => {
    expect(estimateCurrency({ country: "US", epsE: 40, usdEps: [1, 2] })).toBe("USD");
    expect(estimateCurrency({ country: "NL", epsE: 0.8258, usdEps: [0.06, -0.01, -0.03, -0.06] })).toBe("USD");
    expect(estimateCurrency({})).toBe("USD");
  });
});

describe("formatting never puts $ on a non-dollar figure", () => {
  it("formats per-share figures in the native currency", () => {
    expect(epsIn(64.5, "JPY")).toBe("¥64.50");
    expect(epsIn(-0.9624, "CNY")).toBe("-CN¥0.96");
    expect(epsIn(32.224, "TWD")).toBe("NT$32.22");
    expect(epsIn(2.5263, "USD")).toBe("$2.53");
    expect(epsIn(2.5, undefined)).toBe("$2.50");
    expect(epsIn(64.5, "")).toBe("64.50 (local currency)");
    expect(epsIn(null, "JPY")).toBe("—");
  });
  it("formats amounts in the native currency", () => {
    expect(moneyIn(13484.14e9, "JPY")).toBe("¥13.48T");
    expect(moneyIn(33668882128, "CNY")).toBe("CN¥33.7B");
    expect(moneyIn(74.02e9, "DKK")).toBe("DKK 74.0B");
    expect(moneyIn(111356225808, "USD")).toBe("$111B");
  });
});

describe("The Read never compares across currency bases", () => {
  it("compares with last quarter only when both are USD", () => {
    expect(readEstimate("NVIDIA", 2.53, "USD", 2.1)).toBe("Wall Street expects $2.53 a share, versus $2.10 last quarter.");
  });
  it("names the currency and skips the USD comparison for TM and NIO", () => {
    const tm = readEstimate("Toyota", 64.4986, "JPY", 7.57)!;
    expect(tm).toContain("¥64.50");
    expect(tm).toContain("Japanese yen");
    expect(tm).not.toMatch(/\$\d/);
    expect(tm).not.toContain("versus");
    const nio = readEstimate("NIO", -0.0116, "CNY", -0.04)!;
    expect(nio).toContain("-CN¥0.01");
    expect(nio).not.toMatch(/\$-?\d/);
  });
});

describe("share images and calendar feeds", () => {
  it("story card and OG card show ¥ for Toyota", () => {
    const story = storyTickerSvg({ symbol: "TM", name: "Toyota", does: "x", when: "Wed", session: "bmo", epsE: 64.4986, cur: "JPY", move: 3, grade: "B", beats: 2, total: 4 });
    expect(story).toContain("¥64.50 a share");
    expect(story).not.toContain("$64.50");
    const card = cardSvg({ symbol: "TM", name: "Toyota", when: "Wed", session: "bmo", move: 3, beats: 2, total: 4, epsE: 64.4986, cur: "JPY" });
    expect(card).toContain("¥64.50");
    expect(card).not.toContain("$64.50");
  });
  it("ics description uses the estimate's currency", () => {
    const out = buildIcs([{ symbol: "TM", name: "Toyota", date: "2026-11-05", session: "bmo", quarter: 2, year: 2027, epsE: 64.5, cur: "JPY", url: "https://x/t/TM" }], new Date("2026-11-01T00:00:00Z"));
    expect(out).toContain("¥64.50");
    expect(out).not.toContain("$64.50");
  });
});

describe("universe currency seeds", () => {
  it("marks the foreign filers the critic found (TM, SONY, PDD, JD, TSM, NIO, NVO) and leaves US names in dollars", () => {
    expect(curOf("TM")).toBe("JPY");
    expect(curOf("SONY")).toBe("JPY");
    expect(curOf("PDD")).toBe("CNY");
    expect(curOf("JD")).toBe("CNY");
    expect(curOf("TSM")).toBe("TWD");
    expect(curOf("NIO")).toBe("CNY");
    expect(curOf("NVO")).toBe("DKK");
    expect(curOf("NVDA")).toBe("USD");
    expect(curOf("ZZZZ")).toBe("USD");
    expect(UNIVERSE.AAPL.ec).toBeUndefined();
  });
});
