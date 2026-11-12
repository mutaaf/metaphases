import { epsIn } from "./currency";
import { epsVerdict, vsExpected } from "./compare";
import type { TickerResponse } from "./types";

/**
 * 0039: once a company has reported, the sheet, The Read and the share card say so the same day.
 *
 * Finnhub's `symbol=` row for today (or the calendar's cached day) carries the actual within minutes of the
 * print, but Nasdaq's report history (where the sheet's `history` comes from) lags a day or more. Without
 * this, a company that reported at 7 am still "reports today" and "Wall Street expects" until NY midnight.
 */

/** A report day's row, from Finnhub's `symbol=` calendar or the calendar route's cached day. */
export interface DayRow { date: string; hour: string; quarter: number; year: number; eE: number | null; eA: number | null; rE: number | null; rA: number | null; /** 0049: the calendar row's Nasdaq figure on the actual's basis. */ nE?: number; /** 0058: Nasdaq's actual on the estimate's basis (EarningsEvent.nA). */ nA?: number | null }

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

/** "Just reported" stays up this many trading days after the print; after that the history row says it. */
export const JUST_DAYS = 3;

/** Card headline and stat for a reported or due report (share card and story card), or null for a normal one. */
export function reportedCard(d: Pick<TickerResponse, "next" | "justReported">, today: string): { headline: string; stat: { label: string; value: string } } | null {
  const j = d.justReported;
  if (j) return { headline: `Reported Q${j.quarter} ${j.date === today ? "today" : shortDay(j.date)}`, stat: { label: "EPS ACTUAL", value: j.epsA != null ? epsIn(j.epsA, j.currency) : "—" } };
  if (d.next?.status === "results-pending") return { headline: `Q${d.next.quarter} results expected, none in yet`, stat: { label: "EPS EST GOING IN", value: d.next.epsE != null && !d.next.epsBasis ? epsIn(d.next.epsE, d.next.currency) : "—" } };
  return null;
}

/** Signed surprise in % of the estimate, or null when either side is missing. */
export const surprisePct = (est: number | null, act: number | null) => (est != null && act != null && est !== 0 ? ((act - est) / Math.abs(est)) * 100 : null);

const WHEN: Record<string, string> = { bmo: "before the opening bell", amc: "after the close", dmh: "during market hours", "": "" };
const shortDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const onDay = (d: string, today: string) => (d === today ? `today (${longDay(d)})` : `on ${longDay(d)}`);

/** The Read's opening line for a just-reported quarter, in the past tense. `fmt` formats an EPS in its currency. */
export function reportedLine(name: string, r: { date: string; session: string; quarter: number; epsE: number | null; epsA: number | null; nE?: number; nA?: number | null; reit?: boolean }, today: string, fmt: (v: number) => string): string {
  const when = [onDay(r.date, today), WHEN[r.session] ?? ""].filter(Boolean).join(" ");
  const head = `${name} reported Q${r.quarter} ${when}`;
  if (r.epsA == null) return `${head}; the per-share result isn't in our data yet.`;
  const j = epsVerdict({ eA: r.epsA, eE: r.epsE, nE: r.nE, nA: r.nA, reit: r.reit });
  // 0049: an actual on another basis from its estimate (FFO vs net income, adjusted vs GAAP) is neither a beat nor a miss.
  if (j.v === "not-comparable") return `${head}: ${fmt(r.epsA)} a share. That figure isn't on the same basis as the ${fmt(r.epsE as number)} estimate (for example FFO or adjusted earnings against net income), so we don't call it a beat or a miss.`;
  // 0058: judged on the estimate's own basis (Nasdaq's actual against Nasdaq's estimate); the company's figure is named too.
  if (j.act != null && r.epsE != null && j.v) {
    const s = j.pct;
    const verdict = s == null ? (j.v === "beat" ? "above the estimate" : "below the estimate") : Math.abs(s) < 0.5 ? "in line with the estimate" : s > 0 ? `a beat of ${Math.abs(s).toFixed(0)}%` : `a miss of ${Math.abs(s).toFixed(0)}%`;
    return `${head}: ${fmt(r.epsA)} a share in our data feed. On the same basis as the ${fmt(r.epsE)} estimate it was ${fmt(j.act)} (Nasdaq's figures), ${verdict}.`;
  }
  const s = j.pct;
  if (r.epsE == null || j.v == null) return `${head}: ${fmt(r.epsA)} a share.`;
  const est = j.est ?? r.epsE;
  if (s == null) return `${head}: ${fmt(r.epsA)} a share against ${fmt(est)} expected, ${j.v === "beat" ? "above" : "below"} the estimate.`;
  const verdict = Math.abs(s) < 0.5 ? "in line with the estimate" : s > 0 ? `a beat of ${Math.abs(s).toFixed(0)}%` : `a miss of ${Math.abs(s).toFixed(0)}%`;
  return `${head}: ${fmt(r.epsA)} a share against ${fmt(est)} expected${j.via ? " (Nasdaq's forecast on the same basis)" : ""}, ${verdict}.`;
}

/** The Read's opening line while the session has passed and the figures haven't arrived. Never future tense. */
export function pendingLine(name: string, r: { date: string; session: string; quarter: number }, today: string): string {
  const when = [WHEN[r.session] ?? "", onDay(r.date, today)].filter(Boolean).join(" ");
  // "Expected", not "due": the date is usually the feed's projection, not the company's (0038).
  return `${name}'s Q${r.quarter} results were expected ${when}; none are in our data yet.`;
}


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
    ? ` — Reported Q${j.quarter} on ${shortDay(j.date)}${j.epsA != null ? `: ${epsIn(j.epsA, j.currency)} EPS${(() => { const v = epsVerdict({ eA: j.epsA, eE: j.epsE, nE: j.nE, nA: j.nA, reit: j.reit }); return v.v === "not-comparable" ? "" : vsExpected(j, (x) => epsIn(x, j.currency)); })()}` : ""}`
    : d.next?.status === "results-pending" ? ` — Q${d.next.quarter} results expected, none in our data yet${d.next.epsE != null && !d.next.epsBasis ? ` (estimate going in ${epsIn(d.next.epsE, d.next.currency)} EPS)` : ""}`
    : d.next?.epsE != null && !d.next.epsBasis ? ` — Street expects ${epsIn(d.next.epsE, d.next.currency)} EPS` : "";
  // 0059: a date the two calendars disagree on is said to be unconfirmed (overdue / closed rows never carry one).
  const nq = !j && d.next?.nasdaq && !d.next.status && !d.next.overdue && !d.next.closed ? d.next.nasdaq : null;
  const unconfirmed = nq ? ` — ${nq.date === d.next!.date ? `report time unconfirmed (the feed and Nasdaq list ${shortDay(nq.date)} in different sessions)` : `report date unconfirmed (the feed says ${shortDay(d.next!.date)}; Nasdaq lists ${shortDay(nq.date)})`}` : "";
  // 0007: a projected date is said to be unconfirmed too.
  const projected = !j && !nq && d.next?.projected && !d.next.status && !d.next.overdue && !d.next.closed ? ` — report expected around ${shortDay(d.next.date)}, date not yet confirmed by the company` : "";
  if (projected) return `${name}${projected}${lead ? `;${lead.replace(/^ —/, "")}` : ""}. ${bits.join(" · ")}${bits.length ? "." : ""} The full read, phase by phase.`;
  return `${name}${unconfirmed}${unconfirmed && lead ? `;${lead.replace(/^ —/, "")}` : lead}. ${bits.join(" · ")}${bits.length ? "." : ""} The full read, phase by phase.`;
}
