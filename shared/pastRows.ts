// 0072: past calendar rows with no figures are settled against the company's own report history (Nasdaq's
// `earnings-surprise`, the table the ticker sheet already reads), so a past day never states a report as fact
// one way or the other:
// - it did report (AMCR, ATO on Nov 4): Nasdaq has a report within a trading day of the row, so the row takes
//   Nasdaq's pair (actual and its consensus, `pr: "n"`) and is judged like any other;
// - it didn't (NIO on Nov 11): the feed's projected day passed with no results anywhere and the company's last
//   report is a quarter back, so the row is flagged `od` and the calendar files it under "Date not confirmed".
// Anything else (no history, a report on some other recent day, a failed read) leaves the row as it was.
//
// 0076: a lone row on the wrong day moves to the day the company's history gives, but only when that's unambiguous
// (`fd` keeps the feed's day). Nasdaq dates some after-close reports the next morning, so a one-day gap alone can't
// tell which day is right, with one exception: history BEFORE the row (ROKU: row Nov 3, history Nov 2). Nasdaq never
// dates a report before it was out, so whatever the row's session, the report was out by the history's day. History
// one day AFTER the row stays ambiguous (the next-morning habit) and the row keeps its day. Further off (2 to 10
// trading days) the history's report must be for the quarter the row stands for (its fiscal quarter ended within
// PERIOD_LAG_MAX_DAYS before the row); a report for the quarter before never moves it. A moved row's session is
// blanked: the history gives a day, not a time, and the feed's time belonged to the wrong day.
import type { EarningsEvent } from "./types";
import { daysApart, nqDate, tradingDaysSince } from "./pending";

export interface NqReport { date: string; eps: number | null; est: number | null; /** 0076: the fiscal quarter's last day ("Sep 2026" → 2026-09-30), when Nasdaq gives it. */ pe?: string }

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Nasdaq's `fiscalQtrEnd` ("Sep 2026") → the month's last day; null if it isn't one. */
export function nqPeriodEnd(s: unknown): string | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(String(s ?? "").trim());
  const mi = m ? MON.indexOf(m[1].toLowerCase()) : -1;
  if (!m || mi < 0) return null;
  return new Date(Date.UTC(+m[2], mi + 1, 0)).toISOString().slice(0, 10);
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
};

/** Nasdaq's `earnings-surprise` body → its reports, newest first. */
export function nqReports(body: any): NqReport[] {
  const rows: any[] = body?.data?.earningsSurpriseTable?.rows ?? [];
  return rows
    .map((r) => {
      const pe = nqPeriodEnd(r?.fiscalQtrEnd);
      return { date: nqDate(r?.dateReported), eps: num(r?.eps), est: num(r?.consensusForecast), ...(pe ? { pe } : {}) };
    })
    .filter((r): r is NqReport => r.date != null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** How far back the calendar settles rows (Finnhub's range history reaches about a month). */
export const PAST_LOOKBACK_DAYS = 45;
/** Nasdaq posts a report to its history a day or two after it: a row is only called unreported once more than two trading days have passed (the ticket's rule). */
export const OVERDUE_AFTER_TRADING_DAYS = 3;
/** No report within this many days before a passed row (and none since) means the quarter it stands for hasn't reported. */
export const OVERDUE_GAP_DAYS = 60;

/** A row worth checking: its day passed two or more trading days ago, no figures, not a holiday projection, already settled or flagged. */
export const needsPastCheck = (e: EarningsEvent, today: string) =>
  e.eA == null && e.rA == null && !e.c && !e.od && e.d < today && e.d >= addDays(today, -PAST_LOOKBACK_DAYS) && tradingDaysSince(e.d, today) >= 2;

function addDays(d: string, n: number): string {
  const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

/** 0076: a row moves to a same-quarter report this many trading days away, at most (and at least 2: closer is `nearDay`). */
export const MOVE_MAX_TRADING_DAYS = 10;
/** Calendar days that covers, with a holiday: how far `oneRowInRange` looks for past rows moving into a range. */
export const MOVE_REACH_DAYS = 16;
/** A row stands for the fiscal quarter that ended at most this many days before it (10-K reports run to ~90). */
export const PERIOD_LAG_MAX_DAYS = 95;

const tradingGap = (a: string, b: string) => (a <= b ? tradingDaysSince(a, b) : tradingDaysSince(b, a));
const weekday = (d: string) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };
/** The history's report is for the quarter the row stands for. */
const samePeriod = (r: NqReport, day: string) => r.pe != null && r.pe < day && daysApart(r.pe, day) <= PERIOD_LAG_MAX_DAYS;

/** Within one trading day either side (an after-close report Nasdaq dates the next morning, or the reverse). */
const nearDay = (a: string, b: string) => (a <= b ? tradingDaysSince(a, b) : tradingDaysSince(b, a)) <= 1;

/**
 * One past row against the company's reports. `usd`: the row's figures are dollars (Nasdaq's are), so its
 * actual can be filled; otherwise only the overdue flag can apply. `reports === null`: the history couldn't be read.
 */
export function settlePastRow(e: EarningsEvent, reports: NqReport[] | null, usd: boolean, today: string): EarningsEvent {
  if (!reports || !reports.length) return e;
  let hit = reports.find((r) => nearDay(r.date, e.d));
  // 0076: where the row moves, if anywhere. Never a company-dated row (o): its day is the company's word.
  let to: string | null = null;
  if (hit) {
    if (hit.date < e.d && !e.o) to = hit.date; // history before the row: out by then, whatever the session
  } else if (!e.o) {
    const far = reports.find((r) => { const g = tradingGap(r.date, e.d); return g >= 2 && g <= MOVE_MAX_TRADING_DAYS && samePeriod(r, e.d); });
    if (far) { hit = far; to = far.date; }
  }
  if (to && !weekday(to)) to = null; // no grid cell to land on: keep the row where it is
  if (hit && !to && hit.date !== e.d && !nearDay(hit.date, e.d)) hit = undefined; // a far report that can't be landed
  if (hit) {
    // 0041: Nasdaq dates the report on this very day, so of two twin rows (Nov 2 and Nov 3) this one happened.
    if (to) e = { ...e, d: to, h: "", fd: e.d, nd: 1 };
    else if (hit.date === e.d) e = { ...e, nd: 1 };
    if (!usd || hit.eps == null) return e;
    // Nasdaq's own pair, so the verdict never mixes two feeds' EPS bases (0058). No Nasdaq consensus: the feed's
    // estimate stays, and epsVerdict's basis band decides whether the pair can be judged.
    return hit.est != null ? { ...e, eA: hit.eps, eE: hit.est, pr: "n" } : { ...e, eA: hit.eps };
  }
  // A company-dated row (o) that passed with nothing in is the company's word, not a projection: leave it.
  if (e.o) return e;
  if (tradingDaysSince(e.d, today) < OVERDUE_AFTER_TRADING_DAYS) return e; // Nasdaq may simply not have posted it yet
  const newest = reports[0].date;
  if (newest > e.d) return e; // reported after the row's day: some other day, not "didn't report" (0041's ground)
  if (daysApart(newest, e.d) <= OVERDUE_GAP_DAYS) return e; // a report in the weeks before: likely this quarter, dated elsewhere
  return { ...e, od: true };
}
