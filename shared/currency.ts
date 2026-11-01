// Reporting currency for estimates. Finnhub's calendar estimates (EPS and revenue) for foreign
// filers come in the company's reporting currency (JPY, CNY, TWD, DKK…), while Nasdaq's history is
// USD. Never format a number with "$" unless we know it's dollars, and never compare across bases.

/** Display prefix per ISO code. Distinct prefixes where symbols collide (¥ yen vs CN¥ yuan, NT$). */
const SYMBOL: Record<string, string> = {
  USD: "$", JPY: "¥", CNY: "CN¥", TWD: "NT$", HKD: "HK$", EUR: "€", GBP: "£", DKK: "DKK ", CHF: "CHF ",
  KRW: "₩", INR: "₹", BRL: "R$", CAD: "CA$", AUD: "A$", SEK: "SEK ", NOK: "NOK ", ILS: "₪", SGD: "S$", MXN: "MX$",
};
const NAME: Record<string, string> = {
  USD: "US dollars", JPY: "Japanese yen", CNY: "Chinese yuan", TWD: "Taiwan dollars", HKD: "Hong Kong dollars", EUR: "euros",
  GBP: "British pounds", DKK: "Danish kroner", CHF: "Swiss francs", KRW: "Korean won", INR: "Indian rupees", BRL: "Brazilian reais",
  CAD: "Canadian dollars", AUD: "Australian dollars", SEK: "Swedish kronor", NOK: "Norwegian kroner", ILS: "Israeli shekels",
  SGD: "Singapore dollars", MXN: "Mexican pesos",
};
/** Home currency by ISO country, used only to name a currency once the numbers prove it isn't USD. */
const HOME: Record<string, string> = { JP: "JPY", CN: "CNY", HK: "CNY", TW: "TWD", DK: "DKK", KR: "KRW", IN: "INR", DE: "EUR", NL: "EUR", FR: "EUR", LU: "EUR", BR: "BRL" };

/** "" means "not dollars, currency unknown". */
export type Currency = string;

export const normCurrency = (c: unknown): Currency | null => {
  if (typeof c !== "string") return null;
  const u = c.trim().toUpperCase();
  if (u === "RMB") return "CNY";
  return /^[A-Z]{3}$/.test(u) ? u : null;
};

export const isUsd = (c: Currency | null | undefined) => c == null || c === "USD";
export const currencyName = (c: Currency | null | undefined) => (isUsd(c) ? "US dollars" : c ? NAME[c] ?? c : "the company's home currency");
const prefix = (c: Currency | null | undefined) => (isUsd(c) ? "$" : c ? SYMBOL[c] ?? `${c} ` : "");
const suffix = (c: Currency | null | undefined) => (c === "" ? " (local currency)" : "");

export interface CurrencyInputs {
  /** Finnhub profile2 `estimateCurrency` ("Currency used in Estimates data"). */
  estimateCurrency?: unknown;
  /** Finnhub profile2 `currency`. Not trusted on its own (SQM's is CLP while it files in USD); it only names the currency once the numbers prove a non-USD basis. */
  currency?: unknown;
  /** Seeded/refreshed `ec` from data/universe.json. */
  known?: unknown;
  /** ISO country of the company. */
  country?: string | null;
  /** The upcoming EPS estimate, in the unknown basis. */
  epsE?: number | null;
  /** Recent EPS figures known to be USD (Nasdaq history). */
  usdEps?: (number | null | undefined)[];
}

/**
 * The estimate's currency. Order: Finnhub's `estimateCurrency`, then the universe's refreshed value, then a
 * ratio check against USD history for non-US companies (|epsE| more than 4× the largest of the last
 * USD actuals, when those are at least 0.20, means a different basis; tiny GAAP histories like
 * ESTC's 0.06 against a 0.83 adjusted estimate are too noisy to judge). US companies with no other signal are USD.
 */
export function estimateCurrency(i: CurrencyInputs): Currency {
  const own = normCurrency(i.estimateCurrency);
  if (own) return own;
  const known = normCurrency(i.known);
  if (known && known !== "USD") return known;
  const country = (i.country ?? "").toUpperCase();
  if (country && country !== "US" && i.epsE != null && Number.isFinite(i.epsE)) {
    const usd = (i.usdEps ?? []).filter((x): x is number => x != null && Number.isFinite(x)).slice(0, 4).map(Math.abs);
    const max = usd.length ? Math.max(...usd) : 0;
    if (max >= 0.2 && Math.abs(i.epsE) > 4 * max) {
      const listed = normCurrency(i.currency);
      return listed && listed !== "USD" ? listed : HOME[country] ?? "";
    }
  }
  return "USD";
}

/** Per-share figure: "$2.02", "¥64.50", "-CN¥0.96", or "64.50 (local currency)". */
export function epsIn(v: number | null | undefined, c?: Currency | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "-" : ""}${prefix(c)}${Math.abs(v).toFixed(2)}${suffix(c)}`;
}

/** Large amount: "$13.5B", "¥13.48T", "CN¥33.7B". */
export function moneyIn(v: number | null | undefined, c?: Currency | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  const p = prefix(c);
  const body = a >= 1e12 ? `${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(0)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return `${s}${p}${body}${suffix(c)}`;
}

/**
 * The Read's estimate bullet. Only a USD estimate is set against last quarter's USD actual; a
 * foreign-currency estimate is named in its own currency and never compared with a dollar figure.
 */
export function readEstimate(name: string, epsE: number | null | undefined, c: Currency | null | undefined, lastUsdEpsA: number | null | undefined): string | null {
  if (epsE == null || !Number.isFinite(epsE)) return null;
  if (isUsd(c)) return lastUsdEpsA != null ? `Wall Street expects ${epsIn(epsE, "USD")} a share, versus ${epsIn(lastUsdEpsA, "USD")} last quarter.` : null;
  return `Wall Street expects ${epsIn(epsE, c)} a share. That's in ${currencyName(c)}, the currency ${name} reports in, so don't compare it with the US-dollar share price.`;
}
