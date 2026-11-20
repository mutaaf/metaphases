import type { Reaction } from "./types";

/**
 * 0094: a judged quarter with no percentage (a negative or near-zero base) says what happened in words.
 * null when the row has a percentage, isn't judged ("basis differs") or lacks a figure.
 */
export function surpriseWords(r: Pick<Reaction, "epsE" | "epsA" | "surprisePct" | "basis">): string | null {
  if (r.basis || r.surprisePct != null || r.epsE == null || r.epsA == null) return null;
  const e = r.epsE, a = r.epsA;
  if (e < 0 && a > 0) return "turned a profit";
  if (e < 0 && a === 0) return "broke even";
  if (e < 0 && a < 0 && a !== e) return a > e ? "smaller loss" : "bigger loss";
  if (e >= 0 && a < 0) return "posted a loss";
  return a >= e ? "beat" : "missed";
}

/** 0094: a judged row without a percentage is still a beat or a miss (colour it as one). */
export const wordsBeat = (r: Pick<Reaction, "epsE" | "epsA">) => (r.epsA as number) >= (r.epsE as number);

/** 0094: why a quarter reads "basis differs". FFO is named only for a REIT; no other company is told it reported FFO or per ADR. */
export function basisFootnote(reit: boolean): string {
  return reit
    ? "for example funds from operations (FFO) against net income a share"
    : "the estimate and the result look like different measures, such as adjusted profit against GAAP profit";
}
