import { epsIn } from "./currency";
import type { TickerResponse } from "./types";

/**
 * 0039: once a company has reported, the sheet, The Read and the share card say so the same day.
 *
 * Finnhub's `symbol=` row for today (or the calendar's cached day) carries the actual within minutes of the
 * print, but Nasdaq's report history (where the sheet's `history` comes from) lags a day or more. Without
 * this, a company that reported at 7 am still "reports today" and "Wall Street expects" until NY midnight.
 */

/** A report day's row, from Finnhub's `symbol=` calendar or the calendar route's cached day. */
export interface DayRow { date: string; hour: string; quarter: number; year: number; eE: number | null; eA: number | null; rE: number | null; rA: number | null }

export type Outcome = { kind: "reported"; row: DayRow } | { kind: "results-pending"; row: DayRow } | null;

/** Minutes after NY midnight by which a session's results are normally out. Unknown session: never assume. */
const OUT_BY: Record<string, number> = { bmo: 9 * 60 + 30, dmh: 16 * 60, amc: 17 * 60 };

/** True once a report day's session is over in New York (`nowMin` = minutes after NY midnight). */
export const sessionPassed = (hour: string, nowMin: number) => OUT_BY[hour] != null && nowMin >= OUT_BY[hour];

/**
 * What happened to a report on or before `today`.
 * - Figures in (EPS or revenue actual): reported.
 * - Today, session over, no figures: results pending (never "expects").
 * - An earlier day with no figures: results pending; callers only pass such rows inside the grace window,
 *   after which 0038's overdue treatment takes over.
 * - Otherwise (later today, or a future day): null, still upcoming.
 */
export function reportOutcome(row: DayRow | null | undefined, today: string, nowMin: number): Outcome {
  if (!row || !row.date || row.date > today) return null;
  if (row.eA != null || row.rA != null) return { kind: "reported", row };
  if (row.date < today || sessionPassed(row.hour, nowMin)) return { kind: "results-pending", row };
  return null;
}

/** Signed surprise in % of the estimate, or null when either side is missing. */
export const surprisePct = (est: number | null, act: number | null) => (est != null && act != null && est !== 0 ? ((act - est) / Math.abs(est)) * 100 : null);

const WHEN: Record<string, string> = { bmo: "before the opening bell", amc: "after the close", dmh: "during market hours", "": "" };
const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const onDay = (d: string, today: string) => (d === today ? `today (${longDay(d)})` : `on ${longDay(d)}`);

/** The Read's opening line for a just-reported quarter, in the past tense. `fmt` formats an EPS in its currency. */
export function reportedLine(name: string, r: { date: string; session: string; quarter: number; epsE: number | null; epsA: number | null }, today: string, fmt: (v: number) => string): string {
  const when = [onDay(r.date, today), WHEN[r.session] ?? ""].filter(Boolean).join(" ");
  const head = `${name} reported Q${r.quarter} ${when}`;
  if (r.epsA == null) return `${head}; the per-share result isn't in our data yet.`;
  const s = surprisePct(r.epsE, r.epsA);
  if (r.epsE == null || s == null) return `${head}: ${fmt(r.epsA)} a share.`;
  const verdict = Math.abs(s) < 0.5 ? "in line with the estimate" : s > 0 ? `a beat of ${Math.abs(s).toFixed(0)}%` : `a miss of ${Math.abs(s).toFixed(0)}%`;
  return `${head}: ${fmt(r.epsA)} a share against ${fmt(r.epsE)} expected, ${verdict}.`;
}

/** The Read's opening line while the session has passed and the figures haven't arrived. Never future tense. */
export function pendingLine(name: string, r: { date: string; session: string; quarter: number }, today: string): string {
  const when = [WHEN[r.session] ?? "", onDay(r.date, today)].filter(Boolean).join(" ");
  return `${name}'s Q${r.quarter} results were due ${when}; the figures aren't in our data yet.`;
}

const shortDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The `/t/:sym` share description: the reported or pending line first, never "Street expects" once it's out. */
export function tickerShareDesc(name: string, d: Pick<TickerResponse, "next" | "justReported" | "beatRate" | "expectedMove" | "setup" | "compass">): string {
  const bits = [
    d.beatRate ? `Beat ${d.beatRate.beats} of its last ${d.beatRate.total}` : null,
    d.expectedMove != null ? `typical move ±${d.expectedMove.toFixed(1)}%` : null,
    d.setup.grade ? `setup ${d.setup.grade}` : null,
    d.compass.grade ? `Compass quality ${d.compass.grade}` : null,
  ].filter(Boolean);
  const j = d.justReported;
  const lead = j
    ? ` — Reported Q${j.quarter} on ${shortDay(j.date)}${j.epsA != null ? `: ${epsIn(j.epsA, j.currency)} EPS${j.epsE != null ? ` vs ${epsIn(j.epsE, j.currency)} expected` : ""}` : ""}`
    : d.next?.status === "results-pending" ? ` — Q${d.next.quarter} results due, figures not in yet${d.next.epsE != null ? ` (estimate going in ${epsIn(d.next.epsE, d.next.currency)} EPS)` : ""}`
    : d.next?.epsE != null ? ` — Street expects ${epsIn(d.next.epsE, d.next.currency)} EPS` : "";
  return `${name}${lead}. ${bits.join(" · ")}${bits.length ? "." : ""} The full read, phase by phase.`;
}
