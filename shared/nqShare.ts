// 0114: the Nasdaq cross-check window, shared through KV.
// The window's days lived only in each colo's cache (`caches.default`), and a colo fills at most two missing days a
// request (one builder a minute). So a cold colo answered `unchecked` for most of the window while a warm one, a few
// seconds earlier, had it all, and a `/t/*` unfurl fetched on the cold one said "not yet confirmed" for a company
// Nasdaq lists with a time. Each fetched day is now offered to one small KV document (day → sessions, the same call's
// untracked caps, and when it was fetched), and a colo missing a day takes a fresh shared copy instead of reporting
// it unchecked or fetching it again.
import type { NqDay } from "./crossCheck";

export interface NqShareDay {
  /** symbol → session, as the colo cache keeps it. */ h: NqDay;
  /** 0110: the same call's untracked dollar caps (millions), so a colo seeded from here has sized the day too. */ c?: Record<string, number>;
  /** When a colo fetched it (ms). */ at: number;
}
export interface NqShareDoc {
  days: Record<string, NqShareDay>;
  /** Writes on day `d` (UTC date, all colos together): a global budget, since KV's free 1,000 writes a day are shared with the support inbox. */
  w?: { d: string; n: number };
}

/** A shared day is as good as a colo's own copy for as long as that copy would live: 6 h, or 1 h for an empty day. */
export const NQW_FRESH_MS = 6 * 3600_000;
export const NQW_EMPTY_FRESH_MS = 3600_000;
/** All colos together write the document at most this often a day (a full refresh of the window is ~5 writes per 6 h). */
export const NQW_GLOBAL_WRITES_PER_DAY = 120;

const freshFor = (e: NqShareDay) => (Object.keys(e.h).length ? NQW_FRESH_MS : NQW_EMPTY_FRESH_MS);
const okDay = (e: unknown): e is NqShareDay =>
  !!e && typeof e === "object" && typeof (e as NqShareDay).at === "number" && !!(e as NqShareDay).h && typeof (e as NqShareDay).h === "object" && !Array.isArray((e as NqShareDay).h);

/** Milliseconds a shared day stays usable from `now` (0 = stale, malformed, or dated in the future). */
export function shareLife(e: unknown, now: number): number {
  if (!okDay(e)) return 0;
  const age = now - e.at;
  return age < 0 ? 0 : Math.max(0, freshFor(e) - age);
}

/** The shared copies of `days` still fresh at `now` (days the document lacks, or holds stale, are left out). */
export function sharedDays(doc: NqShareDoc | null | undefined, days: string[], now: number): Record<string, { h: NqDay; c?: Record<string, number>; life: number }> {
  const out: Record<string, { h: NqDay; c?: Record<string, number>; life: number }> = {};
  for (const d of days) {
    const e = doc?.days?.[d];
    const life = shareLife(e, now);
    if (life > 0) out[d] = { h: (e as NqShareDay).h, ...((e as NqShareDay).c ? { c: (e as NqShareDay).c } : {}), life };
  }
  return out;
}

/** Does this colo's fetch add anything: a day the document lacks or holds stale? (A fresh shared day is never rewritten.) */
export function shareGrows(doc: NqShareDoc | null | undefined, fetched: Record<string, NqShareDay>, now: number): boolean {
  return Object.keys(fetched).some((d) => shareLife(doc?.days?.[d], now) === 0);
}

/** May the document be written today? (`today` is the writer's UTC date.) */
export const shareBudgetLeft = (doc: NqShareDoc | null | undefined, today: string) => !doc?.w || doc.w.d !== today || doc.w.n < NQW_GLOBAL_WRITES_PER_DAY;

/** Merge a fetch onto the newest document: the newer copy of each day wins; days before `keepFrom` are dropped; the write is counted. */
export function mergeShare(latest: NqShareDoc | null | undefined, fetched: Record<string, NqShareDay>, keepFrom: string, today: string): NqShareDoc {
  const days: Record<string, NqShareDay> = {};
  for (const src of [latest?.days ?? {}, fetched]) {
    for (const [d, e] of Object.entries(src)) {
      if (d < keepFrom || !okDay(e)) continue;
      if (!days[d] || e.at > days[d].at) days[d] = e;
    }
  }
  const n = latest?.w?.d === today ? latest.w.n + 1 : 1;
  return { days, w: { d: today, n } };
}

export const shareDocOk = (v: unknown): v is NqShareDoc =>
  !!v && typeof v === "object" && !Array.isArray(v) && !!(v as NqShareDoc).days && typeof (v as NqShareDoc).days === "object";

/**
 * 0114 bounce 1: every copy of a day (each colo's and this document's) used to expire at the same 6 h mark, so each
 * refresh reopened a cold window and the first reads came back unchecked. A day past its fresh life still serves, as a
 * stale copy, for this long while it is fetched again. A day's listings rarely change within a day; a blank is worse.
 */
export const NQW_STALE_MS = 24 * 3600_000;

/** The shared copies of `days` past their fresh life but younger than NQW_STALE_MS (fresh ones come from `sharedDays`). */
export function staleDays(doc: NqShareDoc | null | undefined, days: string[], now: number): Record<string, { h: NqDay }> {
  const out: Record<string, { h: NqDay }> = {};
  for (const d of days) {
    const e = doc?.days?.[d];
    if (!okDay(e) || shareLife(e, now) > 0) continue;
    const age = now - e.at;
    if (age >= 0 && age < NQW_STALE_MS) out[d] = { h: e.h };
  }
  return out;
}
