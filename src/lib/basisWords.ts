import type { Reaction } from "../../shared/types";

/** 0094: a judged quarter with no percentage (a negative or near-zero base) says what happened in words. */
export function surpriseWords(r: Pick<Reaction, "epsE" | "epsA" | "surprisePct" | "basis">): string | null {
  if (r.basis || r.surprisePct != null || r.epsE == null || r.epsA == null) return null;
  if (r.epsE < 0 && r.epsA >= 0) return r.epsA > 0 ? "turned a profit" : "broke even";
  if (r.epsE < 0 && r.epsA < 0) return r.epsA > r.epsE ? "smaller loss" : r.epsA < r.epsE ? "bigger loss" : null;
  if (r.epsE >= 0 && r.epsA < 0) return "posted a loss";
  return null;
}

/** 0094: why a quarter reads "basis differs", naming FFO only for a REIT and ADRs only for a foreign filer. */
export function basisFootnote(reit: boolean, foreign: boolean): string {
  if (reit) return "for example funds from operations (FFO) against net income a share";
  if (foreign) return "for example a figure per ADR (several shares) against a per-share one, or adjusted profit against GAAP";
  return "the estimate and the result look like different measures, such as adjusted profit against GAAP profit";
}
