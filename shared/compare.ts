// Whether a reported revenue can be judged against its consensus estimate.
//
// Finnhub's revenue actual and estimate aren't always on the same basis: Alphabet's Q3 2026 actual
// ($111.2B) is net of traffic-acquisition costs while the estimate ($132.0B) is gross, which made an
// in-line quarter look like a 15.8% "miss". Foreign filers report in their home currency. A revenue
// surprise beyond REV_BASIS_MAX is far more often a basis mismatch than a real result, so we don't
// colour it, don't count it in any beat rate, and say so.
import { isUsd, type Currency } from "./currency";
import type { EarningsEvent } from "./types";

/** Largest |actual / estimate − 1| we treat as the same basis. Tuned on Oct 26–30 2026: 4 of 182 rows exceed it (HIG −27.6%, VLO +17.5%, BE +13.1%, SPCX +12.3%). */
export const REV_BASIS_MAX = 0.12;

/** "revised": a hair below an estimate that may have been revised after the print (0035), so not called a miss. */
export type RevVerdict = "beat" | "miss" | "not-comparable" | "revised" | null;

/** null = nothing to judge yet (no actual or no estimate). */
export function revenueVerdict(e: Pick<EarningsEvent, "rA" | "rE"> & { pr?: EarningsEvent["pr"] }, cur?: Currency | null): RevVerdict {
  const { rA, rE } = e;
  if (rA == null || rE == null || !Number.isFinite(rA) || !Number.isFinite(rE)) return null;
  if (!isUsd(cur) || rE <= 0 || rA <= 0 || Math.abs(rA / rE - 1) > REV_BASIS_MAX) return "not-comparable";
  if (rA < rE && e.pr !== "s" && rA / rE - 1 > -REV_REVISED_BAND) return "revised";
  return rA >= rE ? "beat" : "miss";
}

/** Revenue that isn't judged: a different basis, or an estimate that may have moved after the print. */
export const revenueSkipped = (v: RevVerdict) => v === "not-comparable" || v === "revised";

export const revenueComparable = (e: Pick<EarningsEvent, "rA" | "rE"> & { pr?: EarningsEvent["pr"] }, cur?: Currency | null) => {
  const v = revenueVerdict(e, cur);
  return v === "beat" || v === "miss";
};

/** Revenue beat rate over reported events, plus how many were left out as not comparable. */
/** `excluded` counts both kinds of unjudged revenue; `revised` is the post-print-estimate share of it (0035). */
export function revenueBeatRate(events: (Pick<EarningsEvent, "s" | "rA" | "rE"> & { pr?: EarningsEvent["pr"] })[], curOf: (s: string) => Currency | null | undefined = () => "USD") {
  let beats = 0, judged = 0, excluded = 0, revised = 0;
  for (const e of events) {
    const v = revenueVerdict(e, curOf(e.s));
    if (revenueSkipped(v)) { excluded++; if (v === "revised") revised++; }
    else if (v) { judged++; if (v === "beat") beats++; }
  }
  return { beats, judged, excluded, revised, pct: judged ? (beats / judged) * 100 : null };
}

// ── One consensus per quarter ───────────────────────────────────────────
// The calendar shows Finnhub's estimate. The sheet's reaction history is built from Nasdaq's table, whose
// `consensusForecast` can differ (META Q3 2026: Finnhub $5.79, Nasdaq $6.52 for the same $7.40 print),
// so the same quarter showed a +28% beat in one place and +13.5% in the other. Prefer Finnhub's figure
// for the quarter when we have it; Nasdaq fills the gaps. 0035 refines that for reported quarters: Finnhub
// revises toward the print, so its figure only wins when it's our pre-report snapshot.

const MON: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
/** Nasdaq "Sep 2026" or Finnhub "2026-09-30" → "2026-09". */
export function periodKey(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const iso = /^(\d{4})-(\d{2})/.exec(p);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const nq = /^([A-Z][a-z]{2})\w* (\d{4})$/.exec(p.trim());
  return nq && MON[nq[1]] ? `${nq[2]}-${MON[nq[1]]}` : null;
}

export interface ConsensusPick { epsE: number | null; epsA: number | null; surprisePct: number | null; source: "finnhub" | "nasdaq" | null }
const num = (v: unknown) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(x) ? x : null; };

/**
 * The estimate, actual and surprise for one past quarter. `fh` is Finnhub's figure for the same quarter
 * (the calendar row on the same report date, or stock/earnings on the same fiscal period), or undefined.
 * `snapshot` is Finnhub's estimate as recorded before the print (0035). For a reported quarter, the
 * order is: snapshot, then Nasdaq's consensus when it's on Finnhub's basis, then Finnhub's current figure.
 */
export function pickConsensus(nq: { estimate: unknown; actual: unknown; surprisePct: unknown }, fh?: { estimate: unknown; actual: unknown } | null, snapshot?: number | null): ConsensusPick {
  const fA = num(fh?.actual), nE = num(nq.estimate), nA = num(nq.actual);
  let fE = num(fh?.estimate);
  const reported = fA != null || nA != null;
  if (reported && fE != null) {
    const snap = num(snapshot);
    if (snap != null) fE = snap;
    else if (sameEpsBasis(nE, fE)) fE = null; // Finnhub's figure may have moved after the print: use Nasdaq's
  }
  const useFh = fE != null;
  const epsE = useFh ? fE : nE;
  const epsA = useFh ? fA ?? nA : nA ?? fA;
  const surprisePct = epsE != null && epsA != null && epsE !== 0
    ? ((epsA - epsE) / Math.abs(epsE)) * 100
    : useFh ? null : num(nq.surprisePct);
  return { epsE, epsA, surprisePct, source: epsE == null ? null : useFh ? "finnhub" : "nasdaq" };
}

// ── 0035: judge a print against the bar set BEFORE it ────────────────────
// Once a company reports, Finnhub revises its consensus toward the actual: Visa's Q3 2026 estimate read
// $3.5055 against a $3.48 print, while the pre-report consensus was $3.43. That turned beats into
// "misses" (V, MA, ABBV, VZ…) and pulled the season's revenue beat rate down to ~44%. So after a print,
// prefer (1) our own snapshot of Finnhub's estimate taken before the report, else (2) Nasdaq's
// pre-report EPS consensus when it's on the same basis, and (3) never call revenue a miss on a figure
// that may have been revised (within 1% below the actual's estimate, with no snapshot).

/** Largest |a / b − 1| at which two EPS estimates for the same quarter count as the same basis. */
export const EPS_BASIS_MAX = 0.2;
/** A revenue shortfall this small, against an estimate that may have been revised after the print, isn't called a miss. */
export const REV_REVISED_BAND = 0.01;

export const sameEpsBasis = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b) && Math.abs(a / b - 1) <= EPS_BASIS_MAX;

/** Pre-report estimates for one day, by symbol. */
export type EstSnapshot = Record<string, { eE: number | null; rE: number | null }>;

/**
 * Before the print (`record`: days after today only): record each row's estimate (`updates` holds the entries that are new or changed,
 * so the caller writes only those).
 * After it: swap in the snapshot (`pr: "s"`), else Nasdaq's pre-report EPS consensus when it agrees on
 * basis (`pr: "n"`). `usd(s)` guards Nasdaq's dollar figures against home-currency estimates.
 */
export function applyPreReport(events: EarningsEvent[], snap: EstSnapshot, nasdaqEps: Record<string, number> = {}, usd: (s: string) => boolean = () => true, record = true): { events: EarningsEvent[]; updates: EstSnapshot } {
  const updates: EstSnapshot = {};
  const out = events.map((e) => {
    if (e.eA == null && e.rA == null) {
      const was = snap[e.s];
      // `record` is false from report day on: Finnhub can revise before the actual lands.
      if (record && (e.eE != null || e.rE != null)) {
        if (!was || was.eE !== e.eE || was.rE !== e.rE) updates[e.s] = { eE: e.eE ?? null, rE: e.rE ?? null };
      }
      return e;
    }
    const s = snap[e.s];
    // Only a complete snapshot (every figure the row has) counts as the pre-report bar.
    if (s && (s.eE != null || s.rE != null) && (s.eE != null || e.eE == null) && (s.rE != null || e.rE == null)) return { ...e, eE: s.eE, rE: s.rE, pr: "s" as const };
    const n = nasdaqEps[e.s];
    if (n != null && usd(e.s) && sameEpsBasis(n, e.eE)) return { ...e, eE: n, pr: "n" as const };
    return e;
  });
  return { events: out, updates };
}

/** Nasdaq's day calendar (`/api/calendar/earnings?date=`) → symbol → pre-report EPS consensus. */
export function nasdaqDayEps(body: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of body?.data?.rows ?? []) {
    const v = parseFloat(String(r?.epsForecast ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
    if (typeof r?.symbol === "string" && Number.isFinite(v)) out[r.symbol] = v;
  }
  return out;
}
