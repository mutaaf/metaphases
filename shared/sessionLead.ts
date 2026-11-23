// 0104: when the feed's session contradicts both Nasdaq and every recent report, Nasdaq's session leads.
// Hormel read "after close" (the feed) for a before-the-open report: Nasdaq listed the same day pre-market, and its
// last four reports all moved the stock on the report day. 0060's contest already measured past moves on Nasdaq's
// session, but the headline stayed the feed's. Here the stricter rule (every measurable report, at least 3) moves the
// headline to Nasdaq's session, still "expected" (the company hasn't said), with the feed's session named beside it.
// The sheet is the only place with report history, so it records its verdict in one small KV record every colo's
// calendar and ICS read, the way 0083's day contests are shared.
import { isContested, reactionMove } from "./reaction";
import type { EarningsEvent, Session } from "./types";

/**
 * True when the feed and Nasdaq give the same day different timed sessions and every one of the last 4 reports
 * that can be measured (at least 3) moved the stock more on Nasdaq's reaction day than on the feed's. A split, a
 * tie, or fewer than 3 measured reports is false: the feed's session stays and the disagreement is flagged (0062).
 */
export function nasdaqSessionLeads(feed: string | undefined, nasdaq: string | undefined, dates: string[], closeOn: (day: string, offset: number) => number | null): boolean {
  if (!isContested(feed, nasdaq)) return false;
  let measured = 0;
  for (const d of dates.slice(0, 4)) {
    const mf = reactionMove(feed as Session, d, closeOn), mn = reactionMove(nasdaq as Session, d, closeOn);
    if (mf == null || mn == null) continue;
    measured++;
    if (!(Math.abs(mn) > Math.abs(mf))) return false;
  }
  return measured >= 3;
}

/** One sheet verdict: on the feed's day `d`, Nasdaq's session `h` leads over the feed's `f`. `at` = NY day last seen. */
export interface SessionLeadMemo { d: string; h: "bmo" | "amc"; f: "bmo" | "amc"; at: string }
export type SessionLeads = Record<string, SessionLeadMemo>;
/** A verdict is kept this many days after the sheet last confirmed it (and only while its report day is still ahead). */
export const LEAD_MEMO_DAYS = 7;
const RESTAMP_DAYS = 3;

const dayNum = (d: string) => Date.parse(d + "T12:00:00Z") / 86400000;
const fresh = (m: SessionLeadMemo, today: string) => dayNum(today) - dayNum(m.at) <= LEAD_MEMO_DAYS && m.d > today;

/**
 * Fold a sheet's verdict for `s` into the record: `lead` notes (or re-stamps) it; null drops a memo for that same
 * day (current evidence against it). Stale entries are pruned. Returns null when nothing changed (nothing written).
 */
export function noteLead(memos: SessionLeads | null | undefined, s: string, d: string, lead: { h: "bmo" | "amc"; f: "bmo" | "amc" } | null, today: string): SessionLeads | null {
  const out: SessionLeads = {};
  let changed = false;
  for (const [k, m] of Object.entries(memos ?? {})) { if (fresh(m, today)) out[k] = m; else changed = true; }
  const m = out[s];
  if (lead) {
    if (!m || m.d !== d || m.h !== lead.h || m.f !== lead.f || dayNum(today) - dayNum(m.at) >= RESTAMP_DAYS) { out[s] = { d, h: lead.h, f: lead.f, at: today }; changed = true; }
  } else if (m && m.d === d) { delete out[s]; changed = true; }
  return changed ? out : null;
}

/**
 * The remembered verdict for a feed row (symbol `s`, day `d`, feed session `h`), or null. Never for a company-dated
 * row, a row with figures in, or when Nasdaq's current listing says something else (another day, or a session that
 * isn't the remembered one): current evidence always wins.
 */
export function leadFor(memos: SessionLeads | null | undefined, s: string, d: string, h: string, today: string, now?: { x?: string; xd?: string; xh?: string } | null): SessionLeadMemo | null {
  const m = memos?.[s];
  if (!m || m.d !== d || m.f !== h || !fresh(m, today)) return null;
  if (now?.x && !(now.x === "differs" && now.xd === d && now.xh === m.h)) return null;
  return m;
}

/**
 * Calendar rows the sheet has settled: Nasdaq's session (`hs: "n"`, expected), the feed's kept in `fh` and Nasdaq's
 * listing in `x`/`xd`/`xh`, so the row reads "Feed: after close · Nasdaq: before open" under Before open.
 */
export function applyLeads(events: EarningsEvent[], memos: SessionLeads | null | undefined, today: string): EarningsEvent[] {
  if (!memos || !Object.keys(memos).length) return events;
  return events.map((e) => {
    if (e.o || e.c || e.od || e.xf || e.fh || e.eA != null || e.rA != null) return e;
    const m = leadFor(memos, e.s, e.d, e.h, today, e);
    return m ? { ...e, h: m.h, hs: "n" as const, fh: m.f, x: "differs" as const, xd: e.d, xh: m.h } : e;
  });
}
