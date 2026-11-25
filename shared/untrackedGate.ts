// 0110: which off-universe ("untracked") companies the calendar shows.
// The feed's revenue is in the company's own currency (CN¥1.9B for a $490M ADR), so revenue alone admitted small ADRs
// and kept out $11–22B US companies with smaller quarterly revenue (RBRK, CRDO, NTNX, GWRE). Nasdaq's day calendar gives
// a dollar market cap: when it lists the company, that decides. Without it, the revenue gate stands as before.

/** An untracked company this large (dollar market cap, Nasdaq's) is on the calendar whatever its revenue. */
export const UNTRACKED_MIN_CAP = 10e9;
/** Quarterly revenue (the feed's currency) that admits an untracked company when Nasdaq has no size for it. */
export const BIG_REVENUE = 1e9;
/** With a known dollar size, big revenue still admits it only from this size (a $300M ADR with CN¥2B revenue doesn't). */
export const REVENUE_MIN_CAP = 1e9;

/** Symbol → dollar market cap in millions, from Nasdaq's day calendars (untracked listings only). */
export type NqCaps = Record<string, number>;

/**
 * Admit an untracked feed row. `capUsd` is Nasdaq's dollar market cap (undefined or 0: Nasdaq gave none).
 * A company-published date (`override`) always shows: the company said when.
 */
export function admitUntracked(revenue: number, capUsd: number | undefined, override: boolean): boolean {
  if (override) return true;
  if (capUsd != null && capUsd > 0) return capUsd >= UNTRACKED_MIN_CAP || (revenue >= BIG_REVENUE && capUsd >= REVENUE_MIN_CAP);
  return revenue >= BIG_REVENUE;
}

/** Nasdaq's day payload → untracked symbol → dollar cap in millions (rows with no cap are left out). */
export function nasdaqDayCaps(body: any, tracked: (sym: string) => boolean): NqCaps {
  const out: NqCaps = {};
  for (const r of body?.data?.rows ?? []) {
    const sym = typeof r?.symbol === "string" ? r.symbol.trim().toUpperCase().replace("/", ".") : "";
    const cap = parseFloat(String(r?.marketCap ?? "").replace(/[$,\s]/g, ""));
    if (!sym || tracked(sym) || !Number.isFinite(cap) || cap <= 0) continue;
    out[sym] = Math.max(1, Math.round(cap / 1e6));
  }
  return out;
}

/** Several days' caps folded into one lookup (the largest figure wins: a listing on any day is the same company). */
export function foldCaps(days: (NqCaps | null | undefined)[]): NqCaps {
  const out: NqCaps = {};
  for (const d of days) for (const [s, c] of Object.entries(d ?? {})) if (!(out[s] >= c)) out[s] = c;
  return out;
}

/** A folded lookup's cap for `sym`, in dollars (undefined when Nasdaq listed no size for it). */
export const capUsd = (caps: NqCaps, sym: string): number | undefined => (caps[sym] ? caps[sym] * 1e6 : undefined);

// ── 0110 bounce: one set of caps every colo reads ──
// The caps above live in each colo's own cache. A colo whose Nasdaq calls fail (YYZ, 2026-11-25) never sizes a day,
// so the revenue gate dropped CRDO ($20B, $540M revenue) there on every read while CMH showed it. A small KV
// document, day → caps, lets every colo size a day any colo has loaded.

/** Day → that day's untracked caps (the shared document). */
export type CapDoc = Record<string, NqCaps>;

/** `local`'s days merged into `shared`: per day, the union of symbols (largest cap wins); days before `keepFrom` dropped. */
export function mergeCapDocs(shared: CapDoc | null | undefined, local: CapDoc, keepFrom: string): CapDoc {
  const out: CapDoc = {};
  for (const src of [shared ?? {}, local])
    for (const [day, caps] of Object.entries(src)) {
      if (day < keepFrom || !caps || typeof caps !== "object") continue;
      const slim = shareable(caps);
      if (Object.keys(slim).length) out[day] = foldCaps([out[day], slim]); // an empty day is "not sized yet", never shared
    }
  return out;
}

/** Only caps that can admit a company are shared ($1B+, millions): Nasdaq's peak days list 300–570 micro-caps, and the
 *  record is parsed on the calendar path (CPU, no 1102s). Below $1B a colo without its own caps keeps the revenue gate. */
export const SHARED_MIN_CAP_M = REVENUE_MIN_CAP / 1e6;
export function shareable(caps: NqCaps): NqCaps {
  const out: NqCaps = {};
  for (const [s, c] of Object.entries(caps)) if (c >= SHARED_MIN_CAP_M) out[s] = c;
  return out;
}

/** Whether `local` holds a day or a symbol `shared` lacks (days before `keepFrom` don't count): then a colo offers it. */
export function capsGrow(shared: CapDoc | null | undefined, local: CapDoc, keepFrom: string): boolean {
  return Object.entries(local).some(([day, caps]) => day >= keepFrom && Object.keys(shareable(caps ?? {})).some((s) => !(shared?.[day]?.[s])));
}
