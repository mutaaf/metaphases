// 0072: past calendar rows with no figures are settled against the company's own report history (Nasdaq's
// `earnings-surprise`, the table the ticker sheet already reads), so a past day never states a report as fact
// one way or the other:
// - it did report (AMCR, ATO on Nov 4): Nasdaq has a report within a trading day of the row, so the row takes
//   Nasdaq's pair (actual and its consensus, `pr: "n"`) and is judged like any other;
// - it didn't (NIO on Nov 11): the feed's projected day passed with no results anywhere and the company's last
//   report is a quarter back, so the row is flagged `od` and the calendar files it under "Date not confirmed".
// Anything else (no history, a report on some other recent day, a failed read) leaves the row as it was.
import type { EarningsEvent } from "./types";
import { daysApart, nqDate, tradingDaysSince } from "./pending";

export interface NqReport { date: string; eps: number | null; est: number | null }

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
};

/** Nasdaq's `earnings-surprise` body → its reports, newest first. */
export function nqReports(body: any): NqReport[] {
  const rows: any[] = body?.data?.earningsSurpriseTable?.rows ?? [];
  return rows
    .map((r) => ({ date: nqDate(r?.dateReported), eps: num(r?.eps), est: num(r?.consensusForecast) }))
    .filter((r): r is NqReport => r.date != null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** How far back the calendar settles rows (Finnhub's range history reaches about a month). */
export const PAST_LOOKBACK_DAYS = 45;
/** No report within this many days before a passed row (and none since) means the quarter it stands for hasn't reported. */
export const OVERDUE_GAP_DAYS = 60;

/** A row worth checking: its day passed two or more trading days ago, no figures, not a holiday projection, already settled or flagged. */
export const needsPastCheck = (e: EarningsEvent, today: string) =>
  e.eA == null && e.rA == null && !e.c && !e.od && e.d < today && e.d >= addDays(today, -PAST_LOOKBACK_DAYS) && tradingDaysSince(e.d, today) >= 2;

function addDays(d: string, n: number): string {
  const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

/** Within one trading day either side (an after-close report Nasdaq dates the next morning, or the reverse). */
const nearDay = (a: string, b: string) => (a <= b ? tradingDaysSince(a, b) : tradingDaysSince(b, a)) <= 1;

/**
 * One past row against the company's reports. `usd`: the row's figures are dollars (Nasdaq's are), so its
 * actual can be filled; otherwise only the overdue flag can apply. `reports === null`: the history couldn't be read.
 */
export function settlePastRow(e: EarningsEvent, reports: NqReport[] | null, usd: boolean): EarningsEvent {
  if (!reports || !reports.length) return e;
  const hit = reports.find((r) => nearDay(r.date, e.d));
  if (hit) {
    if (!usd || hit.eps == null) return e;
    // Nasdaq's own pair, so the verdict never mixes two feeds' EPS bases (0058). No Nasdaq consensus: no verdict.
    return { ...e, eA: hit.eps, eE: hit.est, pr: "n" };
  }
  // A company-dated row (o) that passed with nothing in is the company's word, not a projection: leave it.
  if (e.o) return e;
  const newest = reports[0].date;
  if (newest > e.d) return e; // reported after the row's day: some other day, not "didn't report" (0041's ground)
  if (daysApart(newest, e.d) <= OVERDUE_GAP_DAYS) return e; // a report in the weeks before: likely this quarter, dated elsewhere
  return { ...e, od: true };
}
