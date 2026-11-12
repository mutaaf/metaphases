// Whether a reported revenue can be judged against its consensus estimate.
//
// Finnhub's revenue actual and estimate aren't always on the same basis: Alphabet's Q3 2026 actual
// ($111.2B) is net of traffic-acquisition costs while the estimate ($132.0B) is gross, which made an
// in-line quarter look like a 15.8% "miss". Foreign filers report in their home currency. A revenue
// surprise beyond REV_BASIS_MAX is far more often a basis mismatch than a real result, so we don't
// colour it, don't count it in any beat rate, and say so.
import { isUsd, type Currency } from "./currency";
import type { EarningsEvent } from "./types";
import { SHARE_CLASS } from "./shareClass";

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
/**
 * Two figures for one quarter's EPS in the same unit (0046). Only share-class symbols are checked: a figure cached
 * before the rescale is `div`× off. Every other symbol passes (a tiny EPS really can be revised 0.01 → 0.12).
 */
export const sameEpsUnit = (symbol: string, a: number | null | undefined, b: number | null | undefined) => {
  const c = SHARE_CLASS[symbol];
  if (!c || a == null || b == null || a === 0 || b === 0) return true;
  const r = Math.abs(a / b);
  return r < Math.sqrt(c.div) && 1 / r < Math.sqrt(c.div);
};

/** 0049: a reported row whose EPS is on another basis from its estimate carries Nasdaq's figure (`nE`) when that matches the actual's basis. */
function withNasdaqBasis(e: EarningsEvent, n: number | undefined, usd: (s: string) => boolean): EarningsEvent {
  if (n == null || e.eA == null || e.eE == null || !usd(e.s) || sameEpsBasis(e.eA, e.eE) || sameEpsBasis(e.eE, n) || !sameEpsBasis(e.eA, n)) return e;
  return { ...e, nE: n };
}

/** 0049: a reported row on a different EPS basis from its estimate, which Nasdaq's day calendar may settle. */
export const needsEpsBasis = (e: Pick<EarningsEvent, "eA" | "eE">, snapE?: number | null) =>
  e.eA != null && (snapE ?? e.eE) != null && !sameEpsBasis(e.eA, snapE ?? e.eE);

/**
 * 0058: a row judged against Nasdaq's estimate (`pr: "n"`) is judged against Nasdaq's actual for the same quarter
 * too (`nA`), because the two feeds' EPS bases differ by 5–25% for many names (LITE: Finnhub $4.57 against
 * Nasdaq's $3.82 estimate, while Nasdaq's own actual is $3.76). `nA` is set only when it differs from `eA`;
 * `null` means Nasdaq has no actual for the row, so the pair can't be judged.
 */
function withNasdaqActual(e: EarningsEvent, act: Record<string, number> | undefined): EarningsEvent {
  if (!act || e.eA == null) return e;
  const a = act[e.s];
  if (a == null) return { ...e, nA: null };
  return Math.abs(a - e.eA) < 0.005 ? e : { ...e, nA: a };
}

export function applyPreReport(events: EarningsEvent[], snap: EstSnapshot, nasdaqEps: Record<string, number> = {}, usd: (s: string) => boolean = () => true, record = true, nasdaqAct?: Record<string, number>): { events: EarningsEvent[]; updates: EstSnapshot } {
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
    // Only a complete snapshot (every figure the row has) counts as the pre-report bar, and only in the row's
    // unit: a snapshot recorded before a share-class rescale (0046, BRK.B) is 1,500× off, not drift.
    if (s && (s.eE != null || s.rE != null) && (s.eE != null || e.eE == null) && (s.rE != null || e.rE == null) && sameEpsUnit(e.s, s.eE, e.eE)) return withNasdaqBasis({ ...e, eE: s.eE, rE: s.rE, pr: "s" as const }, nasdaqEps[e.s], usd);
    const n = nasdaqEps[e.s];
    if (n != null && usd(e.s) && sameEpsBasis(n, e.eE)) return withNasdaqActual({ ...e, eE: n, pr: "n" as const }, nasdaqAct);
    return withNasdaqBasis(e, n, usd);
  });
  return { events: out, updates };
}

const dayFigure = (v: unknown) => parseFloat(String(v ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
function dayColumn(body: any, key: "epsForecast" | "eps"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of body?.data?.rows ?? []) {
    const v = dayFigure(r?.[key]);
    if (typeof r?.symbol === "string" && Number.isFinite(v)) out[r.symbol] = v;
  }
  return out;
}
/** Nasdaq's day calendar (`/api/calendar/earnings?date=`) → symbol → pre-report EPS consensus. */
export const nasdaqDayEps = (body: any): Record<string, number> => dayColumn(body, "epsForecast");
/** 0058: the same call's reported EPS (`eps`), on the basis of its own consensus. */
export const nasdaqDayActuals = (body: any): Record<string, number> => dayColumn(body, "eps");

// ── 0049: an EPS actual on the estimate's basis ─────────────────────────
// Finnhub's EPS estimate and actual aren't always the same measure: a REIT's actual is FFO while the
// estimate is GAAP net income per share (UDR "$0.14 → $0.65, +377%" was an in-line quarter), an ADR's
// actual can be per ADR against a per-share estimate (TM, 10×), and a GAAP actual can sit against an
// adjusted consensus (UBER $0.25 vs $0.94). Those rows led Retrace's "biggest" lists. Outside EPS_BAND we
// judge against Nasdaq's pre-report consensus if it is on the actual's basis, else not at all.

/** actual / estimate inside this range counts as the same basis. Tuned on Oct 19–Nov 10 2026: 34 of 482 tracked rows fall outside, nearly all basis mixes (UDR, CPT, TM, EIX, UBER) or near-zero estimates. */
export const EPS_BAND: readonly [number, number] = [0.5, 2];
/** Both figures within this of zero: the direction is meaningful, a percentage of the base isn't. */
export const EPS_NEAR_ZERO = 0.1;

export interface EpsJudgment {
  /** null = nothing to judge yet. */
  v: "beat" | "miss" | "not-comparable" | null;
  /** The estimate it was judged against. */
  est: number | null;
  /** Signed surprise in % of `est`; null when not judged or when both figures are near zero. */
  pct: number | null;
  /** Judged against Nasdaq's consensus because Finnhub's estimate is on another basis. */
  via?: "nasdaq";
  /** 0058: the actual it was judged with, when that isn't the shown `eA` (Nasdaq's actual, on its estimate's basis). */
  act?: number;
}

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** Same sign and actual/estimate inside EPS_BAND. */
export const epsInBand = (a: number | null | undefined, e: number | null | undefined) =>
  fin(a) && fin(e) && e !== 0 && Math.sign(a) === Math.sign(e) && a / e >= EPS_BAND[0] && a / e <= EPS_BAND[1];
const judge = (a: number, e: number, pct = true): EpsJudgment => ({ v: a >= e ? "beat" : "miss", est: e, pct: pct && e !== 0 ? ((a - e) / Math.abs(e)) * 100 : null });

/**
 * One EPS judgment for every surface. `nE`: Nasdaq's pre-report consensus for the same quarter, when known.
 * `reit`: a REIT, whose actual is often FFO against a GAAP estimate even inside EPS_BAND (PSA $2.42 → $4.34
 * Core FFO, "+80%"), so it only counts as the same basis within EPS_BASIS_MAX.
 */
export function epsVerdict(e: { eA: number | null | undefined; eE: number | null | undefined; nE?: number | null; nA?: number | null; reit?: boolean }): EpsJudgment {
  const { eA, eE, nE } = e;
  if (!fin(eA) || !fin(eE)) return { v: null, est: fin(eE) ? eE : null, pct: null };
  // 0058: an estimate from Nasdaq is judged with Nasdaq's actual, never against the other feed's figure.
  if (e.nA === null) return { v: "not-comparable", est: eE, pct: null };
  if (fin(e.nA)) {
    const j = epsVerdict({ eA: e.nA, eE, reit: e.reit });
    return j.v === "beat" || j.v === "miss" ? { ...j, act: e.nA } : j;
  }
  // Nasdaq's figure on the actual's basis wins over a Finnhub estimate that's well apart from both (UDR, PSA).
  if (fin(nE) && sameEpsBasis(eA, nE) && !sameEpsBasis(eE, nE) && !sameEpsBasis(eA, eE)) return { ...judge(eA, nE), via: "nasdaq" };
  const tiny = Math.abs(eE) < EPS_NEAR_ZERO;
  if (e.reit ? sameEpsBasis(eA, eE) : epsInBand(eA, eE)) return judge(eA, eE, !tiny);
  if (tiny && Math.abs(eA) < EPS_NEAR_ZERO) return judge(eA, eE, false);
  return { v: "not-comparable", est: eE, pct: null };
}

export const epsJudged = (j: EpsJudgment) => j.v === "beat" || j.v === "miss";

/** A sheet history row through epsVerdict: a basis mix loses its surprise and says so; a Nasdaq-judged row takes Nasdaq's estimate. */
export function judgeReaction<T extends { epsE: number | null; epsA: number | null; surprisePct: number | null }>(h: T, nE?: number | null, reit?: boolean, nA?: number | null): T & { basis?: "differs" } {
  const j = epsVerdict({ eA: h.epsA, eE: h.epsE, nE, nA, reit });
  if (j.v === "not-comparable") return { ...h, surprisePct: null, basis: "differs" as const };
  // 0058: the history table shows a same-source pair (as Nasdaq's own rows do), so the beat count can't mix feeds.
  if (j.act != null) return { ...h, epsA: j.act, surprisePct: j.pct };
  if (j.via) return { ...h, epsE: j.est, surprisePct: j.pct };
  if (j.v && j.pct == null) return { ...h, surprisePct: null };
  return h;
}

/**
 * 0049: evidence that a REIT's feed estimate is on another basis from what it reports (FFO vs net income a share):
 * one of its last two reports couldn't be judged, or the upcoming estimate is outside EPS_BAND of the latest actual
 * (UDR: $0.14 for Q4 against Q3's $0.67 FFO, while Q3 itself was judged against Nasdaq's $0.64 and carries no flag).
 */
export function reitEstimateOffBasis(history: { epsA: number | null; basis?: "differs" }[], nextEpsE: number | null | undefined): boolean {
  if (history.slice(0, 2).some((h) => h.basis)) return true;
  const last = history.find((h) => h.epsA != null)?.epsA;
  return fin(nextEpsE) && fin(last) && Math.abs(last) >= EPS_NEAR_ZERO && !epsInBand(last, nextEpsE);
}

/** Brokers and listing sites in the Real Estate sector report ordinary EPS; the rest are REITs, which report FFO. */
const NOT_REIT = new Set(["CBRE", "CSGP", "OPEN", "Z", "ZG", "RDFN", "COMP", "JLL", "CWK"]);
/** A REIT: its own per-share measure is FFO, so a GAAP EPS estimate isn't the bar it reports against. */
export const isReit = (symbol: string, sector: string | null | undefined, industry?: string | null) =>
  !NOT_REIT.has(symbol) && (sector === "Real Estate" || /\bREIT\b/.test(industry ?? ""));
