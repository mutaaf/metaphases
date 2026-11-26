// 0083: a Nasdaq date contest that survives a cold read.
// The 0015 window lives in `caches.default`, which is per data center, so a request served by another colo (or
// after an eviction) starts with no Nasdaq days at all. Missing evidence must never read as "no disagreement":
// a contest seen once is remembered (one small KV record every colo can read), and a figure-less feed day whose
// contest can't be ruled out yet is "still checking", never "results expected".
import { crossOne, windowDays, type Cross, type NqWindow } from "./crossCheck";
import type { EarningsEvent, Session } from "./types";

/** One remembered contest: the feed's day `d`, Nasdaq's day `xd` (and session), and the NY day it was last seen. */
export interface XMemo { d: string; xd: string; xh?: Session; at: string }
export type XMemos = Record<string, XMemo>;
/** A memo is kept this many days after it was last seen. */
export const XMEMO_DAYS = 7;

const dayNum = (d: string) => Date.parse(d + "T12:00:00Z") / 86400000;
const fresh = (m: XMemo, today: string) => dayNum(today) - dayNum(m.at) <= XMEMO_DAYS && m.xd >= today;

/** Every weekday of the window (today through `windowEnd`) has loaded: an absent listing is real evidence. */
export const windowCovered = (w: NqWindow | null | undefined, today: string): boolean =>
  !!w && !w.stale?.length && windowDays(today).every((d) => w.loaded.includes(d)); // 0114: a stale day isn't current evidence

/** The remembered contest for `s` on the feed day `d`, as `crossOne` would give it, or null. */
export function memoCross(memos: XMemos | null | undefined, s: string, d: string, today: string): Cross | null {
  const m = memos?.[s];
  if (!m || m.d !== d || m.xd === d || !fresh(m, today)) return null;
  return { x: "differs", xd: m.xd, ...(m.xh ? { xh: m.xh } : {}) };
}

/**
 * What the window and the memo say about a figure-less, non-company-dated feed day `d`:
 * - `contested`: Nasdaq lists the report on another day (now, or on an earlier read);
 * - `clear`: Nasdaq lists it that day, or the whole window loaded and lists it nowhere else;
 * - `checking`: neither can be told yet (a cold or partial window).
 */
export function dayStanding(s: string, d: string, h: Session, w: NqWindow | null | undefined, memos: XMemos | null | undefined, today: string): { k: "contested"; c: Cross } | { k: "clear" } | { k: "checking" } {
  const c = w ? crossOne(s, d, h, w) : null;
  if (c?.x === "differs" && c.xd && c.xd !== d) return { k: "contested", c };
  if (c?.x === "agree" || (c?.x === "differs" && c.xd === d)) return { k: "clear" };
  // A fully loaded window that lists no other day is current evidence: it beats an older memo.
  if (windowCovered(w, today)) return { k: "clear" };
  const m = memoCross(memos, s, d, today);
  if (m) return { k: "contested", c: m };
  return { k: "checking" };
}

/** A memo seen this recently isn't re-stamped (fewer KV writes); it stays fresh for XMEMO_DAYS anyway. */
const RESTAMP_DAYS = 3;

/**
 * Fold what a read found into the memos: a day contest is (re)noted, a current agreement on the same feed day
 * (or `clear`: a fully loaded window that lists no other day) drops it, and stale entries are pruned. Returns
 * null when nothing changed (so nothing is written).
 */
export function noteContests(memos: XMemos | null | undefined, found: { s: string; d: string; c: Cross | null; clear?: boolean }[], today: string): XMemos | null {
  const out: XMemos = {};
  let changed = false;
  for (const [s, m] of Object.entries(memos ?? {})) { if (fresh(m, today)) out[s] = m; else changed = true; }
  for (const { s, d, c, clear } of found) {
    const m = out[s];
    if (c?.x === "differs" && c.xd && c.xd !== d) {
      const next: XMemo = { d, xd: c.xd, ...(c.xh ? { xh: c.xh } : {}), at: today };
      if (!m || m.d !== d || m.xd !== next.xd || m.xh !== next.xh || dayNum(today) - dayNum(m.at) >= RESTAMP_DAYS) { out[s] = next; changed = true; }
    } else if (m && m.d === d && (clear || c?.x === "agree" || (c?.x === "differs" && c.xd === d))) { delete out[s]; changed = true; }
  }
  return changed ? out : null;
}

/** Rows a contest can be read for: figure-less, not company-dated, not closed or already settled (crossCheck's rule). */
const comparable = (e: EarningsEvent) => !e.o && !e.c && e.eA == null && e.rA == null && !e.od && !e.nd && !e.fd;

/** Calendar rows the window left unflagged get the remembered contest (a warm read's own flag always wins, and a fully loaded window is current evidence). */
export function applyMemos(events: EarningsEvent[], memos: XMemos | null | undefined, today: string, w?: NqWindow | null): EarningsEvent[] {
  if (!memos || !Object.keys(memos).length || windowCovered(w, today)) return events;
  return events.map((e) => {
    if (e.x || !comparable(e)) return e;
    const m = memoCross(memos, e.s, e.d, today);
    return m ? { ...e, x: m.x, xd: m.xd, ...(m.xh ? { xh: m.xh } : {}) } : e;
  });
}

/** The contests (and agreements) a crossChecked calendar shows, for `noteContests`. On a fully loaded window an unflagged row is cleared too. */
export const contestsIn = (events: EarningsEvent[], covered = false) =>
  events.filter((e) => comparable(e) && (e.x === "differs" || e.x === "agree" || (covered && !e.x)))
    .map((e) => (e.x ? { s: e.s, d: e.d, c: { x: e.x, ...(e.xd ? { xd: e.xd } : {}), ...(e.xh ? { xh: e.xh } : {}) } as Cross } : { s: e.s, d: e.d, c: null, clear: true }));
