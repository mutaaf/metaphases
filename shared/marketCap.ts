/**
 * The sheet's market value (0042). A tracked company's is the universe's USD figure in millions (0 = unknown
 * → null): Finnhub's profile cap is in the profiled listing's currency and its label can be wrong (SQM "USD"
 * for 15.1T pesos, Shell "USD" for pounds, BABA "CNY" for a dollar figure). Untracked names get the same
 * listing rule the universe build uses (0106: Vipshop's dollar cap read "CN¥6.2B"). A tracked cap follows the
 * price between refreshes (0073, `capNow`).
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

/** Largest move since the stamp we believe; beyond it (an unadjusted split, a bad print) the stored cap stands. */
const MAX_RATIO = 5;
const nyDay = (t: number) => new Date(t * 1000).toISOString().slice(0, 10); // shared/depth.ts nyDate

/**
 * 0073: a tracked company's cap between data refreshes. `mc` (USD millions) was taken at the close of `mcAt`
 * (`px`, scripts/universe_px.py). Scaled by the stock's move since, shares held constant: mc × last ÷ ref, where
 * ref is the chart's own close on `mcAt` (split-adjusted, the same series as `last`), else the stored `px`.
 * `capAt` is the close the figure is at; with no usable price it's the stored cap and its own date.
 */
export function capNow(
  u: { mc: number; px?: number; mcAt?: string },
  chart: { t: number[]; c: number[] } | null | undefined,
): { marketCap: number | null; capAt?: string } {
  if (!(u.mc > 0)) return { marketCap: null };
  const stored = { marketCap: u.mc, ...(u.mcAt ? { capAt: u.mcAt } : {}) };
  const n = chart ? Math.min(chart.t.length, chart.c.length) : 0;
  if (!chart || !n || !u.mcAt) return stored;
  const last = chart.c[n - 1], lastDay = nyDay(chart.t[n - 1]);
  if (!(last > 0) || lastDay <= u.mcAt) return stored;
  let ref: number | undefined;
  for (let i = n - 1; i >= 0; i--) if (nyDay(chart.t[i]) <= u.mcAt) { ref = chart.c[i]; break; }
  const base = ref && ref > 0 ? ref : u.px && u.px > 0 ? u.px : undefined;
  if (!base) return stored;
  const ratio = last / base;
  if (!(ratio >= 1 / MAX_RATIO && ratio <= MAX_RATIO)) return stored;
  return { marketCap: Math.round(u.mc * ratio), capAt: lastDay };
}

export function profileCap(
  u: { mc: number; px?: number; mcAt?: string } | undefined,
  profile: { marketCapitalization?: number; currency?: unknown; exchange?: unknown },
  chart?: { t: number[]; c: number[] } | null,
): { marketCap: number | null; currency: string; capAt?: string } {
  if (u) return { ...capNow(u, chart), currency: "USD" };
  const currency = capCurrency(profile);
  const cap = profile.marketCapitalization;
  return { marketCap: currency && cap != null && Number.isFinite(cap) && cap > 0 ? cap : null, currency: currency ?? "USD" };
}
