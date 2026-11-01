// "Today, in 60 seconds": choose the story cards for the Everyday investor. Pure (unit-tested).
// Her own names first (watchlist, holdings, funds she owns), then the biggest reporters.
import type { EarningsEvent, MacroEvent, MacroResponse } from "../../shared/types";
import type { Holding, WatchItem } from "./store";

export type Story =
  | { kind: "mood"; score: number; label: string }
  | { kind: "report"; e: EarningsEvent; why: "watch" | "owned" | "fund" | "big"; via?: string }
  | { kind: "macro"; m: MacroEvent }
  | { kind: "cta" };

const MACRO_RANK: Record<string, number> = { fomc: 5, cpi: 4, jobs: 3, pce: 2, gdp: 2, retail: 1, ppi: 1, jolts: 0 };

export function pickStories(o: {
  events: EarningsEvent[];
  macro: MacroResponse | null | undefined;
  watch: WatchItem[];
  holdings: Holding[];
  today: string;
  horizon: string; // last date to consider (inclusive)
  mcap: (s: string) => number;
  heldVia: (s: string, h: Holding[]) => { etf: string; dollars: number }[];
  max?: number;
}): Story[] {
  const max = o.max ?? 3;
  const out: Story[] = [];
  if (o.macro?.mood) out.push({ kind: "mood", score: o.macro.mood.score, label: o.macro.mood.label });

  const upcoming = o.events.filter((e) => e.d >= o.today && e.d <= o.horizon);
  const watch = new Set(o.watch.map((w) => w.s));
  const direct = new Set(o.holdings.map((h) => h.s));
  const scored = upcoming.map((e) => {
    const via = o.heldVia(e.s, o.holdings).sort((a, b) => b.dollars - a.dollars)[0];
    const why: "watch" | "owned" | "fund" | "big" = direct.has(e.s) ? "owned" : watch.has(e.s) ? "watch" : via ? "fund" : "big";
    const rank = { owned: 4e9, watch: 3e9, fund: 2e9, big: 0 }[why] + (via?.dollars ?? 0) + o.mcap(e.s) - (Date.parse(e.d) - Date.parse(o.today)) / 864e5;
    return { e, why, via: via?.etf, rank };
  });
  const seen = new Set<string>();
  for (const s of scored.sort((a, b) => b.rank - a.rank)) {
    if (seen.has(s.e.s) || (s.why === "big" && !s.e.t)) continue;
    seen.add(s.e.s);
    out.push({ kind: "report", e: s.e, why: s.why, via: s.via });
    if (seen.size >= max) break;
  }

  const macro = (o.macro?.events ?? [])
    .filter((m) => m.date >= o.today && m.date <= o.horizon)
    .sort((a, b) => (MACRO_RANK[b.key] ?? 0) - (MACRO_RANK[a.key] ?? 0) || a.date.localeCompare(b.date))[0];
  if (macro) out.push({ kind: "macro", m: macro });
  out.push({ kind: "cta" });
  return out;
}
