// 0042: the weekly universe build's currency rules, run in python3 against the cases seen live.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scripts = fileURLToPath(new URL("../../scripts/", import.meta.url));
const py = (code: string) => JSON.parse(execFileSync("python3", ["-I", "-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); from universe_fx import *\n${code}`], { encoding: "utf8" }).trim().split("\n").pop()!);

describe("local_cap_currency (scripts/universe_fx.py)", () => {
  const cases: [string, string, string, string][] = [
    ["TM", "JPY", "TOKYO STOCK EXCHANGE-TOKYO PRO MARKET", "JPY"],
    ["TSM", "TWD", "TAIWAN STOCK EXCHANGE", "TWD"],
    ["SQM", "USD", "SANTIAGO STOCK EXCHANGE", "CLP"], // labelled USD, holds pesos
    ["SHEL", "USD", "LONDON STOCK EXCHANGE", "GBP"], // labelled USD, holds pounds
    ["BP", "USD", "LONDON STOCK EXCHANGE", "GBP"],
    ["BABA", "CNY", "NEW YORK STOCK EXCHANGE, INC.", "USD"], // ADR: a dollar cap whatever the label
    ["NTES", "CNY", "NASDAQ NMS - GLOBAL MARKET", "USD"],
    ["JD", "CNY", "HONG KONG EXCHANGES AND CLEARING LTD", "CNY"],
    ["LI", "RMB", "HONG KONG EXCHANGES AND CLEARING LTD", "CNY"],
    ["ASML", "EUR", "NYSE EURONEXT - EURONEXT AMSTERDAM", "EUR"], // "NYSE EURONEXT" isn't a US exchange
    ["AAPL", "USD", "NASDAQ NMS - GLOBAL MARKET", "USD"],
  ];
  it.each(cases)("%s (%s on %s) → %s", (ticker, currency, exchange, want) => {
    expect(py(`print(json.dumps(local_cap_currency(${JSON.stringify({ ticker, currency, exchange })})))`)).toBe(want);
  });
});

describe("to_usd", () => {
  it("converts at the fresh rate, keeps a last-known one, and never writes a local or impossible figure as dollars", () => {
    const out = py(`
done = {
  "TM": {"mc": 0, "mcCur": "JPY", "mcL": 36000000},
  "OLD": {"mc": 0, "mcCur": "DKK", "mcL": 1000000, "fx": 0.15, "fxAt": "2026-11-01"},
  "NONE": {"mc": 0, "mcCur": "XYZ", "mcL": 5000},
  "BIG": {"mc": 15130410},
  "AAPL": {"mc": 5029592},
}
rates = {"JPY": (0.0063, "2026-11-12"), "DKK": None, "XYZ": None}
print(json.dumps(to_usd(done, lambda c: rates[c])))`);
    expect(out.TM).toMatchObject({ mc: 226800, fx: 0.0063, fxAt: "2026-11-12" });
    expect(out.OLD).toMatchObject({ mc: 150000, fx: 0.15, fxAt: "2026-11-01" });
    expect(out.NONE.mc).toBe(0);
    expect(out.BIG.mc).toBe(0);
    expect(out.AAPL.mc).toBe(5029592);
  });

  it("tries query2 when query1 fails", () => {
    const out = py(`
calls = []
def fetch(host):
    calls.append(host)
    if host.startswith("query1"): raise OSError("429")
    return {"chart": {"result": [{"timestamp": [1794441600], "indicators": {"quote": [{"close": [0.0063]}]}}]}}
import universe_fx; universe_fx.time.sleep = lambda s: None
print(json.dumps([usd_rate("JPY", fetch), calls]))`);
    expect(out).toEqual([[0.0063, "2026-11-12"], ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]]);
  });
});
