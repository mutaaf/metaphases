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

export type RevVerdict = "beat" | "miss" | "not-comparable" | null;

/** null = nothing to judge yet (no actual or no estimate). */
export function revenueVerdict(e: Pick<EarningsEvent, "rA" | "rE">, cur?: Currency | null): RevVerdict {
  const { rA, rE } = e;
  if (rA == null || rE == null || !Number.isFinite(rA) || !Number.isFinite(rE)) return null;
  if (!isUsd(cur) || rE <= 0 || rA <= 0 || Math.abs(rA / rE - 1) > REV_BASIS_MAX) return "not-comparable";
  return rA >= rE ? "beat" : "miss";
}

export const revenueComparable = (e: Pick<EarningsEvent, "rA" | "rE">, cur?: Currency | null) => {
  const v = revenueVerdict(e, cur);
  return v === "beat" || v === "miss";
};

/** Revenue beat rate over reported events, plus how many were left out as not comparable. */
export function revenueBeatRate(events: Pick<EarningsEvent, "s" | "rA" | "rE">[], curOf: (s: string) => Currency | null | undefined = () => "USD") {
  let beats = 0, judged = 0, excluded = 0;
  for (const e of events) {
    const v = revenueVerdict(e, curOf(e.s));
    if (v === "not-comparable") excluded++;
    else if (v) { judged++; if (v === "beat") beats++; }
  }
  return { beats, judged, excluded, pct: judged ? (beats / judged) * 100 : null };
}

// ── One consensus per quarter ───────────────────────────────────────────
// The calendar shows Finnhub's estimate. The sheet's reaction history is built from Nasdaq's table, whose
// `consensusForecast` can differ (META Q3 2026: Finnhub $5.79, Nasdaq $6.52 for the same $7.40 print),
// so the same quarter showed a +28% beat in one place and +13.5% in the other. Prefer Finnhub's figure
// for the quarter when we have it; Nasdaq fills the gaps.

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
 */
export function pickConsensus(nq: { estimate: unknown; actual: unknown; surprisePct: unknown }, fh?: { estimate: unknown; actual: unknown } | null): ConsensusPick {
  const fE = num(fh?.estimate), fA = num(fh?.actual), nE = num(nq.estimate), nA = num(nq.actual);
  const useFh = fE != null;
  const epsE = useFh ? fE : nE;
  const epsA = useFh ? fA ?? nA : nA ?? fA;
  const surprisePct = epsE != null && epsA != null && epsE !== 0
    ? ((epsA - epsE) / Math.abs(epsE)) * 100
    : useFh ? null : num(nq.surprisePct);
  return { epsE, epsA, surprisePct, source: epsE == null ? null : useFh ? "finnhub" : "nasdaq" };
}
