// Luna's coaching for Guess the Report Card and the Pretend Piggy Bank: which lesson of the course is
// next, the reveal line after a report card, and the one tip the piggy bank shows. Pure; the words come
// from the pack (guess / piggy courses), so a new pack can re-voice them. Mirrored in Swift (Coach.swift)
// and pinned by the `coach` vectors.
import type { GuessCourse, PiggyCourse } from "./kidsPacks";
import { reportResult } from "./kidsWhy";

/** The next lesson on a course ladder the kid hasn't finished (null when the course is done). */
export function courseNext(ladder: string[], done: string[]): { id: string; index: number; of: number } | null {
  const i = ladder.findIndex((id) => !done.includes(id));
  return i < 0 ? null : { id: ladder[i], index: i, of: ladder.length };
}

/** What a revealed report card + price move means, in kid words (never stated as certain). */
export function guessReveal(c: GuessCourse, r: { eA: number | null; eE: number | null; move: number | null }): string {
  if (r.eA == null || r.eE == null || r.move == null) return c.reveal.unknown;
  const res = reportResult(r.eA, r.eE);
  if (res === "inline") return c.reveal.inLine;
  const beat = res === "beat", up = r.move >= 0;
  return beat ? (up ? c.reveal.beatUp : c.reveal.beatDown) : (up ? c.reveal.missUp : c.reveal.missDown);
}

export interface PiggyCoachInput { holdings: number; started: string; today: string; value: number; start: number; peeks: number }
export type PiggyTipKey = keyof PiggyCourse["tips"];
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** The one tip the piggy bank shows now. Order: too many peeks → a big move → one basket → brand new → old → baskets. */
export function piggyTip(c: PiggyCourse, x: PiggyCoachInput): { key: PiggyTipKey; text: string } {
  const age = Math.max(0, days(x.started, x.today));
  const chg = x.start > 0 ? ((x.value - x.start) / x.start) * 100 : 0;
  const p = Math.abs(chg).toFixed(0);
  const key: PiggyTipKey =
    x.peeks > c.peekLimit ? "peekMany" :
    chg <= -10 ? "bigDrop" :
    chg >= 10 ? "bigRise" :
    x.holdings <= 1 ? "oneBasket" :
    age < 7 ? "newBank" :
    age >= 30 ? "longTime" :
    x.holdings >= 5 ? "manyBaskets" : "fewBaskets";
  return { key, text: fill(c.tips[key], { n: key === "peekMany" ? x.peeks : x.holdings, days: age, pct: p }) };
}
