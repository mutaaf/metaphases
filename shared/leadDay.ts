// 0099: which day leads when the two calendars disagree on a date neither has confirmed.
//
// 0015 keeps the feed's date and only says Nasdaq lists another. That's right when the feed carries a session of
// its own, but when the feed's row has no time and is its own projection (KSS, URBN: Mon Nov 23, blank) while
// Nasdaq lists another day with a named session (Tue Nov 24, before the open), Nasdaq's listing is the better-
// supported of two unconfirmed dates. It leads, still called unconfirmed, and the feed's day is named beside it.
// Nothing changes when the feed names a session, when the company has announced a date (overrides win), when
// Nasdaq gives no session, or when there's no cross-check at all (a cold window).
import type { EarningsEvent, Session } from "./types";

const timed = (h: Session | "" | undefined): h is "bmo" | "amc" => h === "bmo" || h === "amc";

/** True when Nasdaq's listing (`nq`) should headline the next report instead of the feed's projected row. */
export function leadsNasdaq(feed: { date: string; session: string; source?: string | null }, nq: { date: string; session: Session } | null | undefined, today: string): boolean {
  // Not only while the feed's day is ahead: once it comes (or passes) with no figures and no time, Nasdaq's timed day
  // still leads until it passes itself, or KSS would flip back to "Date not confirmed" the day before it reports.
  if (!nq || feed.source || feed.session || !feed.date) return false;
  return nq.date !== feed.date && nq.date >= today && timed(nq.session);
}

/**
 * Calendar rows for `leadsNasdaq`: placed on Nasdaq's day at Nasdaq's session (`hs: "n"`), with the feed's day kept
 * as the evidence the other way round (`xd` = the feed's day, `xf: 1`), so the row is still `x: "differs"` and
 * counted as not confirmed. A row whose company already has a row on Nasdaq's day stays where it is.
 *
 * 0112: the move doesn't depend on the range asked for. A row whose Nasdaq day falls outside `from`..`to` leaves this
 * range (it used to stay on the feed's day, so a one-day read of Dec 1 listed PVH while every week read had Dec 3);
 * the range that holds Nasdaq's day picks it up through `leadIns`.
 */
export function leadRows(events: EarningsEvent[], from: string, to: string, today: string): EarningsEvent[] {
  const on = new Set(events.map((e) => `${e.s}|${e.d}`));
  const out: EarningsEvent[] = [];
  for (const e of events) {
    if (!leads(e, today)) { out.push(e); continue; }
    if (e.xd! < from || e.xd! > to) continue; // 0112: it belongs to Nasdaq's day, which another range shows
    if (on.has(`${e.s}|${e.xd}`)) { out.push(e); continue; }
    out.push(moved(e));
  }
  return out;
}

const leads = (e: EarningsEvent, today: string) =>
  !(e.xf || e.x !== "differs" || !e.xd || e.o || e.c || e.od || e.fh || e.eA != null || e.rA != null)
  && leadsNasdaq({ date: e.d, session: e.h, source: e.o }, { date: e.xd, session: e.xh ?? "" }, today);

const moved = (e: EarningsEvent): EarningsEvent => {
  const { xh: _xh, ...rest } = e;
  return { ...rest, d: e.xd!, h: e.xh as Session, hs: "n" as const, xd: e.d, xf: 1 as const };
};

/**
 * 0112: rows the feed has on a day outside `from`..`to` (`neighbours`, already cross-checked) that Nasdaq's timed
 * listing leads onto a day inside it, so a one-day read of Nasdaq's day lists them as every wider range does. A
 * company that already has a row in the range (`inRange`) is left to it.
 */
export function leadIns(inRange: EarningsEvent[], neighbours: EarningsEvent[], from: string, to: string, today: string): EarningsEvent[] {
  const have = new Set(inRange.map((e) => e.s));
  const seen = new Set<string>();
  const out: EarningsEvent[] = [];
  for (const e of neighbours) {
    if ((e.d >= from && e.d <= to) || have.has(e.s) || seen.has(e.s) || !leads(e, today)) continue;
    if (e.xd! < from || e.xd! > to) continue;
    seen.add(e.s);
    out.push(moved(e));
  }
  return out;
}
