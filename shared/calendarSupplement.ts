// Ticket 0024: Finnhub's day/range earnings calendar leaves out some tracked companies that its per-symbol
// query (`calendar/earnings?symbol=`, what the ticker sheet reads) does list: Toyota, Sony, Honda, Novo
// Nordisk, JD. They're foreign filers (or dotted share classes), and the range feed either lists them under
// their home listing (7203.T, NOVO B.CO, 9618.HK) or not at all. Two cheap repairs, both pure here:
//   1. aliases: a home-listing row is renamed to the tracked US symbol (no extra calls);
//   2. a supplement: for the ~64 tracked foreign/dotted names, the `symbol=` rows are kept in one small
//      cached document, refreshed a few symbols per request, and merged in when the range feed lacks them.
import type { EarningsEvent, Session } from "./types";

export interface UniverseEntry { n: string; mc: number; c?: string; logo?: string }
export type Universe = Record<string, UniverseEntry>;

/** One symbol's upcoming rows from `symbol=`, already shaped as calendar events. */
export interface SuppEntry { at: number; rows: EarningsEvent[] }
export type SuppDoc = Record<string, SuppEntry>;

/** How long one symbol's `symbol=` answer is trusted before it's refreshed (12 h, per the ticket). */
export const SUPP_TTL_MS = 12 * 3600 * 1000;
/** At most this many `symbol=` calls per calendar request: keeps us far inside Finnhub's 60/min and the CPU budget. */
export const SUPP_PER_REQUEST = 4;

/** A Finnhub home-listing symbol: has an exchange suffix (7203.T, SAP.DE) or a share-class space (NOVO B.CO). */
const HOME_LISTING = /^[A-Z0-9][A-Z0-9 \-]*\.[A-Z]{1,3}$/;

/**
 * Home listing → tracked symbol, read from the universe's Finnhub logo file names (TM's logo is 7203.T.png).
 * Only exchange-suffixed names count, and never one that is itself a tracked symbol: renamed US tickers
 * (FB, SQ, BLL) can belong to someone else now.
 */
export function aliasMap(u: Universe): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [sym, v] of Object.entries(u)) {
    const m = /stock_logo\/([^/]+)\.png$/.exec(v.logo ?? "");
    const home = m?.[1];
    if (!home || home === sym || home in u || !HOME_LISTING.test(home)) continue;
    out[home] = sym;
  }
  return out;
}

/** The names the range feed is known to drop: tracked companies outside the US, plus dotted share classes. Largest first. */
export function supplementSymbols(u: Universe): string[] {
  return Object.entries(u)
    .filter(([s, v]) => (v.c && v.c !== "US") || /[.\-]/.test(s))
    .sort((a, b) => (b[1].mc ?? 0) - (a[1].mc ?? 0))
    .map(([s]) => s);
}

/** Which symbols to refresh now: never-fetched first (in list order), then the oldest, at most `k`. */
export function staleSymbols(doc: SuppDoc, symbols: string[], now: number, k = SUPP_PER_REQUEST, ttl = SUPP_TTL_MS): string[] {
  const due = symbols.filter((s) => !doc[s] || now - doc[s].at >= ttl);
  return due.sort((a, b) => (doc[a]?.at ?? -1) - (doc[b]?.at ?? -1)).slice(0, k);
}

/** A raw Finnhub row as a tracked calendar event under `sym`. */
export const rowToEvent = (e: any, sym: string): EarningsEvent => ({
  s: sym, d: e.date, h: (e.hour || "") as Session, q: e.quarter, y: e.year,
  eE: e.epsEstimate ?? null, eA: e.epsActual ?? null, rE: e.revenueEstimate ?? null, rA: e.revenueActual ?? null, t: 1,
});

/** A `symbol=` answer for `sym`, kept to that symbol's own rows (a mis-keyed answer can't add other companies). */
export function suppRows(sym: string, raw: any[]): EarningsEvent[] {
  const seen = new Set<string>();
  const out: EarningsEvent[] = [];
  for (const e of raw ?? []) {
    if (e?.symbol !== sym || typeof e.date !== "string" || seen.has(e.date)) continue;
    seen.add(e.date);
    out.push(rowToEvent(e, sym));
  }
  return out;
}

/**
 * Add supplement rows for symbols the range feed has no row for in [from, to], only on days that loaded
 * (a failed day stays unknown, never half-filled). When the feed has the symbol anywhere in the range,
 * the feed's row wins and nothing is added.
 */
export function mergeSupplement(events: EarningsEvent[], doc: SuppDoc, from: string, to: string, loaded: (day: string) => boolean): EarningsEvent[] {
  const have = new Set(events.map((e) => e.s));
  const extra: EarningsEvent[] = [];
  for (const [sym, entry] of Object.entries(doc)) {
    if (have.has(sym)) continue;
    for (const r of entry.rows) if (r.d >= from && r.d <= to && loaded(r.d)) extra.push(r);
  }
  return extra.length ? [...events, ...extra] : events;
}
