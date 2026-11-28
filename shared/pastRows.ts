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
// dates a report before it was out, so whatever the row's session, the report was out by the history's day (the
// "reverse" in `nearDay` is this case: the feed, not Nasdaq, put an evening report on the next morning). History
// one day AFTER an after-close row stays ambiguous (the next-morning habit) and the row keeps its day; 0119: one day
// after a row with no session (or a before-open one) moves it, since the feed dated it early (KSS, URBN: Nov 23 for
// Nov 24). Had it been an evening report, the market reacted on Nasdaq's day anyway, so it's never measured wrong. Further off (2 to 10
// trading days, and at most MOVE_MAX_DAYS calendar days) the history's report must be for the quarter the row stands
// for (its fiscal quarter ended within PERIOD_LAG_MAX_DAYS before the row); a report for the quarter before never
// moves it. A row never lands on a weekend or market holiday. A moved row's session is
// blanked: the history gives a day, not a time, and the feed's time belonged to the wrong day.
import type { EarningsEvent } from "./types";
import { daysApart, nqDate, tradingDaysSince } from "./pending";
import { closedDay } from "./dateOverrides";

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
/**
 * …and never further than this many calendar days, so the range that receives a moved row finds it in the ±7-day
 * neighbour read it already makes (0041's `oneRowInRange`). Reading further would cost the Worker more cache calls
 * per request than the free plan allows (0047). A same-quarter report 8+ days off leaves the row where it is.
 */
export const MOVE_MAX_DAYS = 7;
/** A row stands for the fiscal quarter that ended at most this many days before it (10-K reports run to ~90). */
export const PERIOD_LAG_MAX_DAYS = 95;

const tradingGap = (a: string, b: string) => (a <= b ? tradingDaysSince(a, b) : tradingDaysSince(b, a));
/** A trading day: a weekday the NYSE is open (a holiday cell would show the row as closed-day noise, 0045). */
const tradingDay = (d: string) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6 && !closedDay(d); };
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
    else if (hit.date > e.d && !e.o && e.h !== "amc") to = hit.date; // 0119: a day early with no evening session
  } else if (!e.o) {
    const far = reports.find((r) => { const g = tradingGap(r.date, e.d); return g >= 2 && g <= MOVE_MAX_TRADING_DAYS && daysApart(r.date, e.d) <= MOVE_MAX_DAYS && samePeriod(r, e.d); });
    if (far) { hit = far; to = far.date; }
  }
  if (to && !tradingDay(to)) to = null; // no trading-day cell to land on: keep the row where it is
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

// 0080: a past row the feed FILLED with figures can be wrong too (UiPath: "Nov 12 · missed by 44%", while its Q3
// was dated Dec 3 and Nasdaq's history ends Sep 3). The same evidence as `od` says no report came out that day.
/** Most rows with figures are real reports, so only this many suspects (`nx`) per request read a history. */
export const FIGURES_CHECK_MAX = 6;

/**
 * 0080: the company's report history says the feed's figures for day `d` aren't a report: the row is at least
 * OVERDUE_AFTER_TRADING_DAYS old, nothing in the history is within a trading day of it, nothing is newer, and the
 * newest report is more than OVERDUE_GAP_DAYS back. No history (null or empty) or a company-dated row: never.
 */
export function phantomReport(d: string, reports: NqReport[] | null, today: string, companyDated?: unknown): boolean {
  if (companyDated || !reports || !reports.length) return false;
  if (tradingDaysSince(d, today) < OVERDUE_AFTER_TRADING_DAYS) return false;
  if (reports.some((r) => nearDay(r.date, d))) return false;
  const newest = reports[0].date;
  return newest < d && daysApart(newest, d) > OVERDUE_GAP_DAYS;
}

/**
 * 0080: a past row with figures worth a history read: Nasdaq's calendar for its day didn't list the company
 * (`nx`, set when the day is built), and it's old enough for Nasdaq's history to have the report if there was one.
 */
export const needsFiguresCheck = (e: EarningsEvent, today: string) =>
  !!e.nx && (e.eA != null || e.rA != null) && !e.o && !e.c && !e.od && e.d < today && e.d >= addDays(today, -PAST_LOOKBACK_DAYS)
  && tradingDaysSince(e.d, today) >= OVERDUE_AFTER_TRADING_DAYS;

/** 0080: the row without the feed's figures, flagged like 0072's (`od`) and marked as figures withheld (`pf`). */
export function settleFiguresRow(e: EarningsEvent, reports: NqReport[] | null, today: string): EarningsEvent {
  if (!phantomReport(e.d, reports, today, e.o)) return e;
  const { nA: _nA, nE: _nE, nx: _nx, ...rest } = e; // the actual's companions go with it; the estimates stay
  return { ...rest, eA: null, rA: null, od: true, pf: 1 };
}

/**
 * 0119: a past row WITH figures that Nasdaq's day calendar didn't list on the feed's day (`nx`, a 0080 suspect) and that
 * isn't a phantom: when the company's history dates the report one trading day away, the row moves to that day (KSS:
 * feed Mon Nov 23, history and the company's 8-K Tue Nov 24). Same rule as settlePastRow's near-day move: history
 * before the row moves it whatever the session; history after moves it unless the feed says "after the close" (Nasdaq's
 * next-morning habit, QQAM). Never a company-dated row, never onto a weekend or holiday. Figures stay the feed's; the
 * session is blanked (the history gives a day, not a time) and the feed's day is kept as `fd`.
 */
export function reportDayRow(e: EarningsEvent, reports: NqReport[] | null): EarningsEvent {
  if (e.o || !reports || !reports.length) return e;
  const hit = reports.find((r) => nearDay(r.date, e.d));
  if (!hit || hit.date === e.d) return e;
  if (hit.date > e.d && e.h === "amc") return e;
  if (!tradingDay(hit.date)) return e;
  return { ...e, d: hit.date, h: "", fd: e.d, nd: 1 };
}
