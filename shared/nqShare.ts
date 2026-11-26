// 0114: the Nasdaq cross-check window, shared through KV.
// The window's days lived only in each colo's cache (`caches.default`), and a colo fills at most two missing days a
// request (one builder a minute). So a cold colo answered `unchecked` for most of the window while a warm one, a few
// seconds earlier, had it all, and a `/t/*` unfurl fetched on the cold one said "not yet confirmed" for a company
// Nasdaq lists with a time. Each fetched day is now offered to one small KV document (day → sessions + when it was
// fetched), and a colo missing a day takes a fresh shared copy instead of reporting it unchecked or fetching it again.
import type { NqDay } from "./crossCheck";

export interface NqShareDay { /** symbol → session, as the colo cache keeps it. */ h: NqDay; /** When a colo fetched it (ms). */ at: number }
export type NqShareDoc = Record<string, NqShareDay>;

/** A shared day is as good as a colo's own copy for as long as that copy would live: 6 h, or 1 h for an empty day. */
export const NQW_FRESH_MS = 6 * 3600_000;
export const NQW_EMPTY_FRESH_MS = 3600_000;
/** A shared day fetched less than this long ago isn't rewritten by another colo's fetch (KV's free writes are shared). */
export const NQW_REWRITE_MS = 3600_000;

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
export function sharedDays(doc: NqShareDoc | null | undefined, days: string[], now: number): Record<string, { h: NqDay; life: number }> {
  const out: Record<string, { h: NqDay; life: number }> = {};
  for (const d of days) {
    const e = doc?.[d];
    const life = shareLife(e, now);
    if (life > 0) out[d] = { h: (e as NqShareDay).h, life };
  }
  return out;
}

/** Does this colo's fetch add anything: a day the document lacks or holds stale, or one it last saw over an hour ago? */
export function shareGrows(doc: NqShareDoc | null | undefined, fetched: NqShareDoc, now: number): boolean {
  return Object.entries(fetched).some(([d, e]) => {
    const old = doc?.[d];
    if (!okDay(old) || shareLife(old, now) === 0) return true;
    return e.at > old.at && e.at - old.at >= NQW_REWRITE_MS;
  });
}

/** Merge a fetch onto the newest document: the newer copy of each day wins; days before `keepFrom` (passed) are dropped. */
export function mergeShare(latest: NqShareDoc | null | undefined, fetched: NqShareDoc, keepFrom: string): NqShareDoc {
  const out: NqShareDoc = {};
  for (const src of [latest ?? {}, fetched]) {
    for (const [d, e] of Object.entries(src)) {
      if (d < keepFrom || !okDay(e)) continue;
      if (!out[d] || e.at > out[d].at) out[d] = e;
    }
  }
  return out;
}

export const shareDocOk = (v: unknown): v is NqShareDoc => !!v && typeof v === "object" && !Array.isArray(v);
