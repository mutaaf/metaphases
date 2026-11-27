// 0106: an off-universe sheet labelled Finnhub's dollar market cap with the reporting currency (Vipshop "CN¥6.2B"
// for US$6.2B). The cap's currency follows the listing, the same rule the universe build uses (scripts/universe_fx.py).
import { describe, expect, it } from "vitest";
import { capCurrency, profileCap } from "../../shared/marketCap";
import { moneyIn } from "../../shared/currency";

const NYSE = "NEW YORK STOCK EXCHANGE, INC.";
const NASDAQ = "NASDAQ NMS - GLOBAL MARKET";

describe("capCurrency agrees with local_cap_currency (universe_fx.py vectors)", () => {
  const cases: [string, string, string, string | null][] = [
    ["TM", "JPY", "TOKYO STOCK EXCHANGE-TOKYO PRO MARKET", "JPY"],
    ["TSM", "TWD", "TAIWAN STOCK EXCHANGE", "TWD"],
    ["SQM", "USD", "SANTIAGO STOCK EXCHANGE", "CLP"],
    ["SHEL", "USD", "LONDON STOCK EXCHANGE", "GBP"],
    ["BABA", "CNY", NYSE, "USD"],
    ["NTES", "CNY", NASDAQ, "USD"],
    ["JD", "CNY", "HONG KONG EXCHANGES AND CLEARING LTD", "CNY"],
    ["LI", "RMB", "HONG KONG EXCHANGES AND CLEARING LTD", "CNY"],
    ["ASML", "EUR", "NYSE EURONEXT - EURONEXT AMSTERDAM", "EUR"],
    ["AAPL", "USD", NASDAQ, "USD"],
    // Labelled USD on a foreign exchange we can't place: we don't know the money, so we don't show it.
    ["XX", "USD", "MYSTERY STOCK EXCHANGE", null],
    ["YY", "USD", "", "USD"],
  ];
  it.each(cases)("%s (%s on %s) → %s", (_t, currency, exchange, want) => {
    expect(capCurrency({ currency, exchange })).toBe(want);
  });
});

describe("profileCap for a company outside the universe", () => {
  const vectors: [string, number, string, string][] = [
    ["VIPS", 6185.88, NYSE, "$6.2B"],
    ["GOTU", 484.2, NYSE, "$484M"],
    ["BILI", 4437.4, NASDAQ, "$4.4B"],
    ["HUYA", 444.46, NYSE, "$444M"],
  ];
  it.each(vectors)("%s: a CNY-reporting US listing's cap reads in dollars", (_s, marketCapitalization, exchange, want) => {
    const p = profileCap(undefined, { marketCapitalization, currency: "CNY", exchange });
    expect(p.currency).toBe("USD");
    expect(moneyIn(p.marketCap! * 1e6, p.currency)).toBe(want);
  });
  it("leaves a US company unchanged", () => {
    expect(profileCap(undefined, { marketCapitalization: 1234, currency: "USD", exchange: NASDAQ })).toEqual({ marketCap: 1234, currency: "USD" });
  });
  it("gives a home listing's cap in its own money, and no figure when the money is unknown", () => {
    expect(profileCap(undefined, { marketCapitalization: 15130410, currency: "USD", exchange: "SANTIAGO STOCK EXCHANGE" })).toEqual({ marketCap: 15130410, currency: "CLP" });
    expect(profileCap(undefined, { marketCapitalization: 900, currency: "USD", exchange: "MYSTERY STOCK EXCHANGE" }).marketCap).toBeNull();
  });
  it("still prefers the universe's dollar figure for a tracked company", () => {
    expect(profileCap({ mc: 35620 }, { marketCapitalization: 237493, currency: "CNY", exchange: "HONG KONG EXCHANGES AND CLEARING LTD" })).toEqual({ marketCap: 35620, currency: "USD" });
  });
});
