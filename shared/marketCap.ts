/**
 * The sheet's market value (0042). A tracked company's is the universe's USD figure in millions (0 = unknown
 * → null): Finnhub's profile cap is in the profiled listing's currency and its label can be wrong (SQM "USD"
 * for 15.1T pesos, Shell "USD" for pounds, BABA "CNY" for a dollar figure). Untracked names get the same
 * listing rule the universe build uses (0106: Vipshop's dollar cap read "CN¥6.2B").
 */

// A port of scripts/universe_fx.py `local_cap_currency`; tests/unit/adrCap0106.test.ts runs its vectors.
const US_EXCHANGES = ["NASDAQ", "NEW YORK STOCK EXCHANGE", "NYSE MKT", "NYSE ARCA", "NYSE AMERICAN", "CBOE", "BATS", "OTC"];
const EXCHANGE_HOME: [string, string][] = [["TOKYO", "JPY"], ["TAIWAN", "TWD"], ["SANTIAGO", "CLP"], ["COPENHAGEN", "DKK"], ["EURONEXT", "EUR"],
  ["XETRA", "EUR"], ["HONG KONG", "HKD"], ["LONDON", "GBP"], ["SWISS", "CHF"], ["TORONTO", "CAD"]];

/**
 * Currency of profile2's `marketCapitalization`: dollars on a US exchange whatever the label (an ADR's label is
 * its reporting currency), the exchange's home money for a foreign listing labelled "USD", else the label.
 * Unlike the build script, a "USD" label on a foreign exchange we can't place gives null: we don't know the money.
 */
export function capCurrency(p: { currency?: unknown; exchange?: unknown }): string | null {
  const ex = (typeof p.exchange === "string" ? p.exchange : "").toUpperCase();
  const cur = (typeof p.currency === "string" && p.currency ? p.currency : "USD").toUpperCase().replace("RMB", "CNY");
  if (US_EXCHANGES.some((u) => ex.startsWith(u))) return "USD";
  if (cur === "USD" && ex) return EXCHANGE_HOME.find(([k]) => ex.includes(k))?.[1] ?? null;
  return cur;
}

export function profileCap(
  u: { mc: number } | undefined,
  profile: { marketCapitalization?: number; currency?: unknown; exchange?: unknown },
): { marketCap: number | null; currency: string } {
  if (u) return { marketCap: u.mc > 0 ? u.mc : null, currency: "USD" };
  const currency = capCurrency(profile);
  const cap = profile.marketCapitalization;
  return { marketCap: currency && cap != null && Number.isFinite(cap) && cap > 0 ? cap : null, currency: currency ?? "USD" };
}
