// 0100: one report, one answer for non-dollar reporters (ADRs). The calendar row carries the feed's figures in the
// company's own currency, and they match the company's release (PDD RMB 21.04, BABA RMB 8.10). Nasdaq's
// `earnings-surprise` table is in dollars, 5–15% off the company's own translation (PDD $2.99 against US$3.14, BABA
// $1.04 against US$1.21), and for JD that flips the verdict. So the sheet's row for the calendar's report takes the
// calendar's pair, and Nasdaq's older dollar pairs only count when its newest actual agrees with the company's figure
// in dollars.
import type { Reaction } from "./types";
import type { Currency } from "./currency";
import { daysApart } from "./pending";
import { adsScale } from "./adsBasis";

/** Nasdaq's newest dollar actual must be within this of the calendar's actual converted to dollars. */
export const ADR_FX_MAX = 0.03;
/** "Same report" between the sheet's past row and a calendar row (the feed's day can be a day off Nasdaq's). */
export const ADR_SAME_DAYS = 1;

export interface CalendarPair {
  d: string;
  eE?: number | null;
  eA?: number | null;
  /** The row's currency when it isn't the estimate currency ("USD": 0097's Nasdaq pair). Defensive: day caches are
   *  stored before that step, so a cached row doesn't carry it today. */
  ec?: string;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The sheet row (index) for the calendar row's report, or -1. Dated rows only. */
export function sameReportRow(history: Pick<Reaction, "date">[], d: string): number {
  return history.findIndex((h) => h.date.length === 10 && Math.abs(daysApart(h.date, d)) <= ADR_SAME_DAYS);
}

/** Last day of a Nasdaq `fiscalQtrEnd` label ("Sep 2026" → "2026-09-30"), else null. */
export function periodEnd(label: string): string | null {
  const m = /^([A-Za-z]{3})\w* (\d{4})$/.exec(label.trim());
  if (!m) return null;
  const i = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase());
  if (i < 0) return null;
  const last = new Date(Date.UTC(+m[2], i + 1, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * Nasdaq's dollar actual agrees with the company's own-currency actual at `perUsd` units of currency per dollar
 * (the rate on the quarter's last day, as companies translate). Unknown rate or figure: not shown to agree.
 */
export function nasdaqMatchesCompany(nasdaqUsd: number | null | undefined, companyEps: number | null | undefined, perUsd: number | null | undefined): boolean {
  if (!fin(nasdaqUsd) || !fin(companyEps) || !fin(perUsd) || perUsd <= 0 || companyEps === 0) return false;
  const inUsd = companyEps / perUsd;
  if (Math.sign(inUsd) !== Math.sign(nasdaqUsd)) return false;
  // An ADS worth a whole number of shares (TSM 5, TM 10): Nasdaq's per-ADS figure is that multiple of a per-share one.
  const ratio = nasdaqUsd / inUsd, ads = Math.round(ratio);
  return ads >= 1 && Math.abs(ratio / ads - 1) <= ADR_FX_MAX;
}

/** Units per dollar on `day` from Yahoo's daily FX bars, else null. Bars are stamped at midnight London, which is 23:00Z
 *  the day before in summer: the date is read 12 h later, so a bar is always its own day. */
export function rateOn(t: number[], c: number[], day: string): number | null {
  let rate: number | null = null;
  t.forEach((ts, i) => { if (new Date((ts + 43200) * 1000).toISOString().slice(0, 10) <= day && c[i] > 0) rate = c[i]; });
  return rate;
}

/**
 * The sheet's history with the calendar's pair on the calendar's report (in `cur`, judged by `judge`), and Nasdaq's
 * other dollar pairs marked "basis differs" (`why: "fx"`) unless its newest actual matches the company's at `perUsd`. No calendar
 * pair in the company's currency (a cold cache, a row the calendar shows in dollars): history unchanged. With `sym`, a
 * row on the per-share basis is first put on the ADS basis (0103, `onAdsBasis`).
 */
export function companyCurrencyPairs(
  history: Reaction[], row: CalendarPair | null, cur: Currency, perUsd: number | null,
  judge: (h: Reaction) => Reaction, sym?: string,
): Reaction[] {
  if (!row || !fin(row.eE) || !fin(row.eA) || (row.ec && row.ec !== cur)) return history;
  const at = sameReportRow(history, row.d);
  if (at < 0) return history;
  const nq = history[at];
  // 0103: a row the feed gave per ordinary share goes on the ADS basis Nasdaq and the company use (both figures agree).
  const n = sym ? adsScale(sym, row, { est: nq.epsE, eps: nq.epsA }, perUsd) : 1;
  const eE = row.eE * n, eA = row.eA * n;
  const { basis: _b, why: _w, ...rest } = nq;
  const surprisePct = eE !== 0 ? ((eA - eE) / Math.abs(eE)) * 100 : null;
  const own = { ...judge({ ...rest, epsE: eE, epsA: eA, surprisePct }), cur };
  // The just-reported row (0039) has no Nasdaq figure yet: nothing to test, so the older pairs stand until it lists.
  const agrees = nq.epsA == null || nasdaqMatchesCompany(nq.epsA, eA, perUsd);
  return history.map((h, i) => i === at ? own
    : agrees || h.cur || h.epsA == null || h.basis ? h
    : { ...h, surprisePct: null, basis: "differs" as const, why: "fx" as const });
}
