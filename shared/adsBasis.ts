import type { EarningsEvent } from "./types";

// 0103: an ADR's calendar row on the wrong share basis. Finnhub can give a Chinese ADR's report per *ordinary share*
// (its Hong Kong line: JD's Nov 17 row read CN¥3.0175 → 2.94) or per *ADS* (CN¥4.52 → 5.87 the day before), and it
// switched overnight. These companies headline per ADS (JD: "RMB 5.88 (US$0.88) per ADS"), and so does Nasdaq's
// dollar table. A per-share row shows half (or an eighth of) the number every outlet quotes.
//
// Nasdaq's dollars are 5–15% off the companies' own translation (0100), so they can't confirm a figure to 3%. They
// can tell a basis apart: per share sits about the ADS ratio (2×, 5×, 8×) away from Nasdaq's figure, per ADS sits
// near 1×. A row is put on the ADS basis only when the estimate and the actual both say so (two independent signals,
// LESSONS 2026-11-21), with the ratio from the published table below, never derived. Anything missing: unchanged.

/** Ordinary shares per ADS, for ADRs whose companies headline per ADS. Each from the company's Form 20-F cover page. */
export const ADS_SHARES: Readonly<Record<string, number>> = {
  JD: 2,   // JD.com: one ADS represents two Class A ordinary shares
  LI: 2,   // Li Auto: two Class A ordinary shares
  XPEV: 2, // XPeng: two Class A ordinary shares
  TME: 2,  // Tencent Music: two Class A ordinary shares
  PDD: 4,  // PDD Holdings: four Class A ordinary shares
  NTES: 5, // NetEase: five ordinary shares
  BIDU: 8, // Baidu: eight Class A ordinary shares
  BABA: 8, // Alibaba: eight ordinary shares
};

/** Once scaled, each figure must be within this factor of Nasdaq's, and as given at least ratio / this away
 *  (JD per ADS is 12% off; per share ~1.8–2×). */
export const ADS_NEAR = 1.5;
/** Nasdaq figures under this many dollars are left alone: cent rounding near breakeven (LI, XPEV) can't decide a basis. */
export const ADS_MIN_USD = 0.1;

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** How far apart two same-signed figures are, as |ln(a/b)|; null across a sign change or at zero. */
function gap(a: number, b: number): number | null {
  if (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) return null;
  return Math.abs(Math.log(a / b));
}

export interface OwnPair { eE?: number | null; eA?: number | null; ec?: string }
export interface DollarPair { est?: number | null; eps?: number | null }

/**
 * Shares per ADS to multiply the row's per-share figures by (`n`), or 1 to leave the row as it is. `row` is in the
 * company's currency; `nq` is Nasdaq's dollar pair for the same report; `perUsd` is units of currency per dollar.
 * Needs both pairs complete and Nasdaq's at least ADS_MIN_USD: the estimate and the actual must each sit about the
 * ratio away from Nasdaq's as given (≥ n / ADS_NEAR) and within ADS_NEAR of it once scaled. Anything else: 1.
 */
export function adsScale(sym: string, row: OwnPair | null | undefined, nq: DollarPair | null | undefined, perUsd: number | null | undefined): number {
  const n = ADS_SHARES[sym];
  if (!n || n < 2 || !row || !nq || row.ec === "USD") return 1;
  if (!fin(perUsd) || perUsd <= 0 || !fin(row.eA) || !fin(row.eE) || !fin(nq.eps) || !fin(nq.est)) return 1;
  if (Math.abs(nq.eps) < ADS_MIN_USD || Math.abs(nq.est) < ADS_MIN_USD) return 1;
  const usd = (v: number) => v / perUsd;
  const aRaw = gap(nq.eps, usd(row.eA)), aAds = gap(nq.eps, usd(row.eA * n));
  const eRaw = gap(nq.est, usd(row.eE)), eAds = gap(nq.est, usd(row.eE * n));
  if (aRaw == null || aAds == null || eRaw == null || eAds == null) return 1;
  const far = Math.log(n / ADS_NEAR), near = Math.log(ADS_NEAR);
  return aRaw >= far && eRaw >= far && aAds <= near && eAds <= near ? n : 1;
}

/** The row on the ADS basis when `adsScale` says so (estimate and actual together), else the row itself. */
export function onAdsBasis<T extends OwnPair>(sym: string, row: T, nq: DollarPair | null | undefined, perUsd: number | null | undefined): T {
  const n = adsScale(sym, row, nq, perUsd);
  return n === 1 ? row : { ...row, eE: (row.eE as number) * n, eA: (row.eA as number) * n };
}

// ── 0103 bounce: one decision per report, remembered ──────────────────────────────────────────────────────────────
// The first build checked at most four ADRs per request (newest first), so a busy week (BABA, PDD, NTES, TME, BIDU,
// XPEV, JD) never reached JD, and a narrow range did: three answers for one report. Each decision Nasdaq confirmed is
// now remembered per colo (`AdsMemo`), keyed by symbol and day with the feed's figures as given. A row whose figures
// still match takes the remembered basis with no history read, so every range answers alike and the steady state
// costs one cache read instead of one per ADR. A remembered report also stands in when the range has no row for that
// company at all (the feed or the supplement dropped it): a report Nasdaq dates is never shown as missing.

/** One remembered decision: the feed's figures as given (`gE`/`gA`), the scale chosen and the row as shown. */
export interface AdsMemoEntry { gE: number; gA: number; n: number; row: EarningsEvent }
/** `SYM|YYYY-MM-DD` → its decision. */
export type AdsMemo = Record<string, AdsMemoEntry>;

export const adsMemoKey = (s: string, d: string) => `${s}|${d}`;

/** The row on the remembered basis when the memo holds this report with the same figures as given, else null. */
export function fromAdsMemo(e: EarningsEvent, memo: AdsMemo | null | undefined): EarningsEvent | null {
  const m = memo?.[adsMemoKey(e.s, e.d)];
  if (!m || e.eE !== m.gE || e.eA !== m.gA) return null;
  const nd = m.row.nd && !e.nd ? { nd: 1 as const } : {};
  return m.n === 1 && !("nd" in nd) ? e : { ...e, ...nd, eE: (e.eE as number) * m.n, eA: (e.eA as number) * m.n };
}

/** A decision worth remembering: both figures as given, and the row as shown (without the day cache's `nx`). */
export function adsMemoEntry(given: EarningsEvent, shown: EarningsEvent): AdsMemoEntry | null {
  if (!shown.nd) return null; // only a report on Nasdaq's own day is remembered (a twin a day off never is)
  if (!fin(given.eE) || !fin(given.eA) || !fin(shown.eE) || !fin(shown.eA) || given.eA === 0) return null;
  const n = Math.round(shown.eA / given.eA);
  const { nx: _nx, ...row } = shown;
  return { gE: given.eE, gA: given.eA, n: n >= 1 ? n : 1, row };
}

/** `latest` with `updates` laid over it, minus reports older than `cut` (YYYY-MM-DD). Never fewer entries than read. */
export function mergeAdsMemo(latest: AdsMemo | null | undefined, updates: AdsMemo, cut: string): AdsMemo {
  const out: AdsMemo = {};
  for (const [k, v] of Object.entries({ ...(latest ?? {}), ...updates })) if (v?.row?.d >= cut) out[k] = v;
  return out;
}

/**
 * Remembered reports in [from, to] for companies with no row in that range, on days that loaded (a failed day stays
 * unknown). A company with any row in the range keeps the feed's: the memo only ever fills a gap.
 */
export function restoreAdsReports(events: EarningsEvent[], memo: AdsMemo | null | undefined, from: string, to: string, loaded: (d: string) => boolean): EarningsEvent[] {
  if (!memo) return events;
  const have = new Set(events.filter((e) => e.d >= from && e.d <= to).map((e) => e.s));
  const add = Object.values(memo).map((m) => m.row)
    .filter((r) => r && r.nd && r.s in ADS_SHARES && r.d >= from && r.d <= to && !have.has(r.s) && loaded(r.d))
    .sort((a, b) => a.d.localeCompare(b.d) || a.s.localeCompare(b.s));
  const seen = new Set<string>();
  const uniq = add.filter((r) => (seen.has(r.s) ? false : (seen.add(r.s), true)));
  return uniq.length ? [...events, ...uniq] : events;
}
