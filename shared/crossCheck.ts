// 0015: cross-check upcoming report dates against Nasdaq's per-day earnings calendar.
// Finnhub's free calendar often carries a projected date (blank session) until the company announces one.
// Nasdaq's per-day calendar (`api.nasdaq.com/api/calendar/earnings?date=`) is a second, independent
// aggregator. Neither is ground truth (LESSONS 2026-11-05), so we never replace a date with Nasdaq's: we only
// say when they disagree, and fill a blank session when both list the company on the same day.
import type { EarningsEvent, Session } from "./types";

/** How many calendar days ahead the cross-check covers (today included). */
export const XCHECK_DAYS = 14;
/** A Finnhub date this far past the window can still be compared with a Nasdaq listing inside it (CSCO-shaped). */
export const XCHECK_REACH = 31;
/** Untracked Nasdaq rows are kept only for companies at least this large (the calendar's other gate is revenue). */
export const XCHECK_MIN_CAP = 1e9;

/** One Nasdaq day, slimmed for the cache: symbol → session ("" = Nasdaq didn't say). */
export type NqDay = Record<string, Session>;
/** Several Nasdaq days folded together: symbol → the days (and sessions) Nasdaq lists it on, earliest first. */
export type NqIndex = Record<string, { d: string; h: Session }[]>;

const SESSION: Record<string, Session> = { "time-pre-market": "bmo", "time-after-hours": "amc" };

const money = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Slim Nasdaq's day payload to symbol → session. `keep` decides which symbols are worth caching (the
 * universe, or anything large); the full day is ~1,300 rows in peak weeks and we use a fraction of it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nasdaqDaySessions(body: any, keep: (sym: string, marketCap: number) => boolean = () => true): NqDay {
  const out: NqDay = {};
  for (const r of body?.data?.rows ?? []) {
    const sym = typeof r?.symbol === "string" ? r.symbol.trim().toUpperCase().replace("/", ".") : "";
    if (!sym || !keep(sym, money(r?.marketCap))) continue;
    out[sym] = SESSION[r?.time] ?? "";
  }
  return out;
}

/** Fold loaded days into one index. Only days that actually loaded belong in `days`. */
export function buildIndex(days: Record<string, NqDay>): NqIndex {
  const idx: NqIndex = {};
  for (const d of Object.keys(days).sort()) {
    for (const [s, h] of Object.entries(days[d])) (idx[s] ??= []).push({ d, h });
  }
  return idx;
}

/** The cross-check's view: the index plus which days in the window actually loaded. */
export interface NqWindow { from: string; to: string; loaded: string[]; idx: NqIndex }

export interface Cross { x: "agree" | "differs" | "unknown"; /** Nasdaq's day, on `differs`. */ xd?: string; /** Nasdaq's session, when it gives one. */ xh?: Session; /** A session filled in from Nasdaq (agree only). */ h?: Session }

const dayNum = (d: string) => Date.parse(d + "T12:00:00Z") / 86400000;

/**
 * Compare one Finnhub date with Nasdaq's listings.
 * - `agree`: Nasdaq lists the company that day (and doesn't give a different session). A blank session is
 *   filled from Nasdaq's.
 * - `differs`: Nasdaq lists it on another day in the window, or on the same day in the other session.
 * - `unknown`: every day in the window loaded and Nasdaq doesn't list it at all.
 * - `null`: nothing to say (outside the window, or that day's Nasdaq answer failed).
 */
export function crossOne(s: string, d: string, h: Session, w: NqWindow): Cross | null {
  if (!w.loaded.length || d < w.from) return null;
  const list = w.idx[s] ?? [];
  if (d > w.to) {
    // A projected date past the window while Nasdaq lists this company inside it: likely the same report.
    if (!list.length || dayNum(d) - dayNum(w.to) > XCHECK_REACH) return null;
    return { x: "differs", xd: list[0].d, ...(list[0].h ? { xh: list[0].h } : {}) };
  }
  if (!w.loaded.includes(d)) return null; // Nasdaq's answer for that day failed: we can't tell
  const same = list.find((l) => l.d === d);
  if (same) {
    // Nasdaq has no "during market hours" label, so a dmh session isn't compared.
    if (h && h !== "dmh" && same.h && same.h !== h) return { x: "differs", xd: d, xh: same.h };
    return { x: "agree", ...(same.h ? { xh: same.h } : {}), ...(!h && same.h ? { h: same.h } : {}) };
  }
  if (list.length) return { x: "differs", xd: list[0].d, ...(list[0].h ? { xh: list[0].h } : {}) };
  // Not on Nasdaq's day, and not elsewhere: only "unknown" when every day in the window was checked.
  return w.loaded.length >= windowDays(w.from).length ? { x: "unknown" } : null;
}

/**
 * Calendar events with `x`/`xd`/`xh` set and blank sessions filled where both feeds agree. Company-dated
 * rows (`o`, 0013), closed-day projections (`c`, 0045) and rows with figures in are left alone.
 */
export function crossCheck(events: EarningsEvent[], w: NqWindow): EarningsEvent[] {
  if (!w.loaded.length) return events;
  return events.map((e) => {
    if (e.o || e.c || e.eA != null || e.rA != null) return e; // company-dated, closed-day or already reported: the date is settled
    const c = crossOne(e.s, e.d, e.h, w);
    if (!c) return e;
    return { ...e, h: c.h ?? e.h, x: c.x, ...(c.xd ? { xd: c.xd } : {}), ...(c.xh ? { xh: c.xh } : {}) };
  });
}

/** Weekdays from `today` through the window's last day. */
export function windowDays(today: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < XCHECK_DAYS; i++) {
    const d = new Date((dayNum(today) + i) * 86400000);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const windowEnd = (today: string) => new Date((dayNum(today) + XCHECK_DAYS - 1) * 86400000).toISOString().slice(0, 10);
