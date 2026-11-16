// 0064: rows the feed projects onto a market holiday (`c`, set by flagClosed in shared/dateOverrides.ts) are not
// dated reports. The calendar keeps them out of a day's reporting count and session groups and files them under
// "Date not confirmed" instead. 0072: so are past rows that never happened (`od`: the projected day passed with
// no results anywhere and the company hasn't reported the quarter). 0078: and a feed date Nasdaq contests with
// another day, once the feed's day has come: it isn't a report day until the company says so.
import type { EarningsEvent } from "./types";

type Row = Pick<EarningsEvent, "c" | "od"> & Partial<Pick<EarningsEvent, "d" | "o" | "x" | "xd" | "eA" | "rA">>;

/**
 * 0078: the feed's day has come (or passed) with no figures, no company date (`o`), and Nasdaq's calendar lists
 * the report on another day (PDD: feed Mon Nov 16, Nasdaq Thu Nov 19). Not a report day, not "figures pending".
 * Depends on `today`, so it's computed by the caller, never stored in a cache.
 */
export const contestedDay = (e: Row, today: string) =>
  !e.o && e.x === "differs" && !!e.xd && !!e.d && e.xd !== e.d && e.d <= today && e.eA == null && e.rA == null;

/** Not a dated report: projected onto a holiday (0064), a projection that passed unreported (0072) or, given `today`, a contested day that has come (0078). */
export const unconfirmedRow = (e: Row, today?: string) => !!e.c || !!e.od || (today != null && contestedDay(e, today));

export function splitClosed<E extends Row>(events: E[], today?: string): { dated: E[]; unconfirmed: E[] } {
  const dated: E[] = [], unconfirmed: E[] = [];
  for (const e of events) (unconfirmedRow(e, today) ? unconfirmed : dated).push(e);
  return { dated, unconfirmed };
}
