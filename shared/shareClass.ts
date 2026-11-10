// 0046: share classes whose per-share figures differ from what the feeds report.
//
// Finnhub gives Berkshire's EPS (calendar estimates and actuals, `stock/earnings`, the metric series) per
// Class A share, while the tracked symbol is the Class B share: "$8,202.91 a share" on a $577 stock.
// Berkshire's own 8-K prints both and says "Per share amounts for Class B shares are 1/1,500th of those
// shown for Class A shares". GOOGL/GOOG and similar pairs have equal per-share figures and need nothing.

export interface ShareClass {
  /** Divide the feed's per-share figures by this to get the tracked share's. */
  div: number;
  /** Where the ratio is published. */
  source: string;
}

export const SHARE_CLASS: Readonly<Record<string, ShareClass>> = {
  "BRK.B": {
    div: 1500,
    source: "https://www.sec.gov/Archives/edgar/data/1067983/000119312526344495/d159922dex991.htm",
  },
};

/** The tracked share's EPS from a feed's per-share figure (unchanged for every other symbol). */
export function shareEps<T extends number | null | undefined>(symbol: string, v: T): T {
  const c = SHARE_CLASS[symbol];
  return (c && typeof v === "number" && Number.isFinite(v) ? v / c.div : v) as T;
}

/** Yahoo spells share classes with a dash: BRK.B → BRK-B, BF.B → BF-B. */
export const yahooSymbol = (symbol: string) => symbol.replace(/\./g, "-");
