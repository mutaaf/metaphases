// Company-announced report dates (ticket 0013). Finnhub's free calendar often carries a projected date;
// when a company has published a different one, `data/date-overrides.json` records it with the press
// release as its source, and the company's date wins on the calendar, the sheet and share meta.
// Curated by hand from company releases only. Every entry needs an https `source` and a `checked` date.
import type { EarningsEvent, Session } from "./types";
import { HOLIDAYS } from "./market";

export interface DateOverride {
  date: string; // YYYY-MM-DD, the company's announced release date
  hour?: Exclude<Session, "">; // the company's announced session; left out when the company names none (0056): the row is then "session unknown", never the feed's guess for its projected day
  quarter: number; // Finnhub's quarter label for this report (used to find and replace its row)
  year: number;
  source: string; // https URL of the company's announcement (or a wire copy of it)
  checked: string; // YYYY-MM-DD the source was last read
  note?: string;
}
export type DateOverrides = Record<string, DateOverride>;

/** Days after its date that an override keeps correcting Finnhub (a stale projected row can linger past the print). */
export const EXPIRE_DAYS = 14;
/** Rows of the same symbol this close to the override date are the same report, whatever quarter label they carry. */
export const SAME_REPORT_DAYS = 21;
/** A future override whose source hasn't been re-read in this long fails the gate. */
export const MAX_CHECK_AGE = 30;

const dayNum = (d: string) => Date.parse(d + "T12:00:00Z") / 86400000;
const gap = (a: string, b: string) => Math.abs(dayNum(a) - dayNum(b));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function activeOverrides(all: DateOverrides, today: string): DateOverrides {
  const out: DateOverrides = {};
  for (const [s, o] of Object.entries(all)) if (dayNum(today) - dayNum(o.date) <= EXPIRE_DAYS) out[s] = o;
  return out;
}

const sameReport = (o: DateOverride, d: string, q: number | undefined, y: number | undefined) =>
  (q === o.quarter && y === o.year) || gap(d, o.date) <= SAME_REPORT_DAYS;

/** Which of several rows for the same report to keep: the one on the company's date, then one with results, then estimates. */
const rank = (e: EarningsEvent, o: DateOverride) => (e.d === o.date ? 4 : 0) + (e.eA != null ? 2 : 0) + (e.eE != null ? 1 : 0);

/**
 * Calendar events for [from, to]: an overridden symbol's row for that report is moved to the company's date
 * and session (estimates kept), or added without estimates when Finnhub has no row, or dropped when the
 * company's date falls outside the range.
 */
export function applyToEvents(events: EarningsEvent[], all: DateOverrides, from: string, to: string, today: string, tracked: (s: string) => boolean = () => true): EarningsEvent[] {
  const live = activeOverrides(all, today);
  if (!Object.keys(live).length) return events;
  const out: EarningsEvent[] = [];
  const found = new Map<string, EarningsEvent>();
  for (const e of events) {
    const o = live[e.s];
    if (o && sameReport(o, e.d, e.q, e.y)) {
      const prev = found.get(e.s);
      if (!prev || rank(e, o) > rank(prev, o)) found.set(e.s, e);
      continue;
    }
    out.push(e);
  }
  for (const [s, o] of Object.entries(live)) {
    if (o.date < from || o.date > to) continue;
    const wd = new Date(o.date + "T12:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const base = found.get(s);
    out.push(base
      ? { ...base, d: o.date, h: o.hour ?? "", o: o.source }
      : { s, d: o.date, h: o.hour ?? "", q: o.quarter, y: o.year, eE: null, eA: null, rE: null, rA: null, t: tracked(s) ? 1 : 0, o: o.source });
  }
  return out;
}

/** Finnhub `calendar/earnings?symbol=` rows for one symbol, with the company's date applied the same way. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyToRows(symbol: string, rows: any[], all: DateOverrides, today: string): any[] {
  const o = activeOverrides(all, today)[symbol];
  if (!o) return rows;
  const mine = rows.filter((r) => sameReport(o, r.date, r.quarter, r.year));
  const rest = rows.filter((r) => !mine.includes(r));
  const base = mine.find((r) => r.date === o.date) ?? mine.find((r) => r.epsActual != null) ?? mine.find((r) => r.epsEstimate != null) ?? mine[0];
  const fixed = base
    ? { ...base, date: o.date, hour: o.hour ?? "", source: o.source }
    : { symbol, date: o.date, hour: o.hour ?? "", quarter: o.quarter, year: o.year, epsEstimate: null, epsActual: null, revenueEstimate: null, revenueActual: null, source: o.source };
  return [...rest, fixed];
}

/** Gate for the committed file: problems as "SYM: message". Expired entries are inert and not checked for age. */
export function validateOverrides(raw: unknown, today: string): string[] {
  const errs: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["file: must be an object keyed by symbol"];
  for (const [s, v] of Object.entries(raw as Record<string, any>)) {
    if (s.startsWith("_")) continue; // comments
    const bad = (m: string) => errs.push(`${s}: ${m}`);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) bad("symbol must be upper case");
    if (!v || typeof v !== "object") { bad("entry must be an object"); continue; }
    if (typeof v.date !== "string" || !ISO.test(v.date)) bad("date must be YYYY-MM-DD");
    else if ([0, 6].includes(new Date(v.date + "T12:00:00Z").getUTCDay())) bad("date falls on a weekend; check the release");
    if (v.hour !== undefined && !["bmo", "amc", "dmh"].includes(v.hour)) bad("hour must be bmo, amc or dmh, or left out when the company names no session");
    if (!Number.isInteger(v.quarter) || v.quarter < 1 || v.quarter > 4) bad("quarter must be 1–4");
    if (!Number.isInteger(v.year)) bad("year must be a number");
    if (typeof v.source !== "string" || !/^https:\/\/[^\s]+\.[^\s]+/.test(v.source)) bad("source must be an https URL of the company's announcement");
    if (typeof v.checked !== "string" || !ISO.test(v.checked)) { bad("checked must be YYYY-MM-DD"); continue; }
    if (v.checked > today) bad(`checked ${v.checked} is in the future`);
    if (typeof v.date === "string" && ISO.test(v.date) && dayNum(today) - dayNum(v.date) <= EXPIRE_DAYS && dayNum(today) - dayNum(v.checked) > MAX_CHECK_AGE)
      bad(`checked ${v.checked} is more than ${MAX_CHECK_AGE} days old; re-read the source`);
  }
  return errs;
}

/**
 * The NYSE holiday on `d` ("Thanksgiving"), or null on a trading day (early closes trade). A feed's projected
 * report on a US market holiday is almost surely not the real date (0045). Weekends are deliberately not
 * flagged: some companies really do publish then (Berkshire releases on Saturdays).
 */
export function closedDay(d: string): string | null {
  return HOLIDAYS.find((x) => x.date === d)?.name ?? null;
}

/** Flags upcoming calendar events projected onto a market holiday (`c`), unless the company announced the date (`o`) or results are in. */
export function flagClosed(events: EarningsEvent[]): EarningsEvent[] {
  return events.map((e) => {
    const c = e.o || e.eA != null ? null : closedDay(e.d);
    return c ? { ...e, c } : e;
  });
}
