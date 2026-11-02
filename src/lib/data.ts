import universeRaw from "../../data/universe.json";
import etfRaw from "../../data/etf_holdings.json";
import type { EarningsEvent } from "../../shared/types";
import { revenueVerdict } from "../../shared/compare";

export interface Co { n: string; logo: string; mc: number; ind: string; sec: string; c: string; web: string; sp: boolean; ec?: string }
// Non-S&P names carry Finnhub industry labels; fold them into the 11 GICS sectors.
const GICS: Record<string, string> = {
  Technology: "Information Technology", Semiconductors: "Information Technology", "Financial Services": "Financials", Banking: "Financials",
  Insurance: "Financials", Media: "Communication Services", "Telecommunication": "Communication Services", Retail: "Consumer Discretionary",
  Automobiles: "Consumer Discretionary", "Hotels, Restaurants & Leisure": "Consumer Discretionary", "Textiles, Apparel & Luxury Goods": "Consumer Discretionary",
  Pharmaceuticals: "Health Care", Biotechnology: "Health Care", "Health Care": "Health Care", "Life Sciences Tools & Services": "Health Care",
  "Aerospace & Defense": "Industrials", Airlines: "Industrials", Machinery: "Industrials", "Electrical Equipment": "Industrials", Logistics: "Industrials",
  Energy: "Energy", "Oil & Gas": "Energy", Utilities: "Utilities", "Real Estate": "Real Estate", Metals: "Materials", "Metals & Mining": "Materials", Chemicals: "Materials",
  Beverages: "Consumer Staples", "Food Products": "Consumer Staples", "Road & Rail": "Industrials", Marine: "Industrials", "Consumer products": "Consumer Staples",
  "Auto Components": "Consumer Discretionary", "Diversified Consumer Services": "Consumer Discretionary", "Leisure Products": "Consumer Discretionary",
};
const GICS_SET = new Set(["Communication Services", "Consumer Discretionary", "Consumer Staples", "Energy", "Financials", "Health Care", "Industrials", "Information Technology", "Materials", "Real Estate", "Utilities"]);
export const UNIVERSE = Object.fromEntries(
  Object.entries(universeRaw as unknown as Record<string, Co>).map(([k, c]) => [k, { ...c, sec: GICS_SET.has(c.sec) ? c.sec : GICS[c.sec] ?? GICS[c.ind] ?? "Other" }]),
) as Record<string, Co>;
export const ETFS = (etfRaw as unknown as { asOf: string; etfs: Record<string, { n: string; er?: number; h: [string, number][] }> }).etfs;
export const ETF_ASOF = (etfRaw as { asOf: string }).asOf;

export const co = (s: string): Co | undefined => UNIVERSE[s];
export const nameOf = (s: string) => UNIVERSE[s]?.n ?? s;
/** Currency of a company's estimates ("USD" unless the universe knows it reports in another). */
export const curOf = (s: string): string => UNIVERSE[s]?.ec ?? "USD";
/** Popularity proxy: market cap (millions). Untracked large reporters fall in after the universe. */
export const popularity = (e: EarningsEvent) => (UNIVERSE[e.s]?.mc ?? 0) + (e.rE ?? 0) / 1e9;

export type Result = "beat" | "mixed" | "miss" | null;
/**
 * Beat = EPS and revenue both clear consensus; miss = both fall short; mixed otherwise. Revenue that
 * isn't comparable with its estimate (different basis or currency, see shared/compare.ts) is ignored.
 */
export function resultOf(e: EarningsEvent): Result {
  if (e.eA == null) return null;
  const epsBeat = e.eE == null ? null : e.eA >= e.eE;
  const rv = revenueVerdict(e, curOf(e.s));
  const revBeat = rv === "beat" ? true : rv === "miss" ? false : null;
  if (epsBeat == null) return null;
  if (revBeat == null) return epsBeat ? "beat" : "miss";
  if (epsBeat && revBeat) return "beat";
  if (!epsBeat && !revBeat) return "miss";
  return "mixed";
}
export const surprise = (e: EarningsEvent) => (e.eA == null || e.eE == null || e.eE === 0 ? null : ((e.eA - e.eE) / Math.abs(e.eE)) * 100);

export const SECTORS = Array.from(new Set(Object.values(UNIVERSE).map((c) => c.sec).filter(Boolean))).sort();

/** Look-through: which ETFs in a list of holdings contain `sym`, and at what weight. */
export function heldVia(sym: string, holdings: { s: string; v: number }[]) {
  const out: { etf: string; weight: number; dollars: number }[] = [];
  for (const h of holdings) {
    const f = ETFS[h.s];
    if (!f) continue;
    const row = f.h.find(([s]) => s === sym || s.replace(".", "-") === sym || (sym === "GOOGL" && s === "GOOG") || (sym === "GOOG" && s === "GOOGL"));
    if (row) out.push({ etf: h.s, weight: row[1], dollars: (h.v * row[1]) / 100 });
  }
  return out;
}
