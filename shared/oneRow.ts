// 0041: one report, one row. The feed can list a single report several times: FedEx Freight's Q3 came back as
// three rows (Oct 28 with no session, and two Oct 29 after-close rows labelled Q3 2026 and Q4 2026), and Amcor's
// Nov 4 report twice (Q3 2026 and Q1 2027). Its fiscal labels can't be trusted to tell them apart, so the rule is
// the one date overrides use: rows of one symbol within a week of each other are the same report (no company
// reports twice in a week). The calendar keeps the best of them, so a glancer sees one FDXF, not a reported row
// beside a "to come" twin, and the season counters count each report once.
import type { EarningsEvent } from "./types";
import { daysApart } from "./pending";

/** Rows of one symbol this many calendar days apart or closer are one report. */
export const SAME_REPORT_DAYS = 7;

/**
 * Which row speaks for the report, best first: the one with the company's figures (actual EPS and revenue, then
 * either), then a company-announced date, then a real date (not a holiday projection or a day that passed
 * unreported), then one with a session, then the feed's own actual over one filled from Nasdaq, then the later date
 * (the feed's latest word, as a moved date is usually pushed later).
 */
function rank(e: EarningsEvent): (number | string)[] {
  const has = (v: number | null) => (v != null ? 1 : 0);
  return [
    has(e.eA) & has(e.rA),
    has(e.eA) | has(e.rA),
    e.o ? 1 : 0,
    e.c || e.od ? 0 : 1,
    e.h ? 1 : 0,
    e.pr === "n" ? 0 : 1,
    e.d,
  ];
}

const better = (a: EarningsEvent, b: EarningsEvent) => {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
  return false;
};

/** Collapse each symbol's rows that stand for one report into the best of them; everything else is untouched, in order. */
export function oneReportOneRow(events: EarningsEvent[]): EarningsEvent[] {
  const bySym = new Map<string, number[]>();
  events.forEach((e, i) => {
    const list = bySym.get(e.s);
    if (list) list.push(i); else bySym.set(e.s, [i]);
  });
  const drop = new Set<number>();
  const replace = new Map<number, EarningsEvent>();
  for (const idx of bySym.values()) {
    if (idx.length < 2) continue;
    const sorted = [...idx].sort((a, b) => events[a].d.localeCompare(events[b].d));
    // Clusters: each starts at its earliest row and takes every row within SAME_REPORT_DAYS of it.
    let start = 0;
    while (start < sorted.length) {
      let end = start + 1;
      while (end < sorted.length && daysApart(events[sorted[start]].d, events[sorted[end]].d) <= SAME_REPORT_DAYS) end++;
      const group = sorted.slice(start, end);
      if (group.length > 1) {
        let best = group[0];
        for (const i of group) if (better(events[i], events[best])) best = i;
        const w = events[best];
        // A same-day twin may carry the session the best row lacks.
        const h = w.h || group.map((i) => events[i]).find((e) => e.d === w.d && e.h)?.h || w.h;
        if (h !== w.h) replace.set(best, { ...w, h });
        for (const i of group) if (i !== best) drop.add(i);
      }
      start = end;
    }
  }
  if (!drop.size) return events;
  return events.flatMap((e, i) => (drop.has(i) ? [] : [replace.get(i) ?? e]));
}
