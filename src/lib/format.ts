export { epsIn, moneyIn, currencyName, isUsd } from "../../shared/currency";
export const money = (v: number | null | undefined) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
export const eps = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`);
export const pct = (v: number | null | undefined, d = 1, sign = true) => (v == null ? "—" : `${sign && v > 0 ? "+" : ""}${v.toFixed(d)}%`);
/** Market cap from Finnhub is in millions. */
export const mcap = (m: number) => money(m * 1e6);
