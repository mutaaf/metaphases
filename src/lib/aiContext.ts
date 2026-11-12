// Grounding for every AI surface: compact, structured facts built from data the page already has.
// Pure functions (unit-tested) — the worker renders them into prompt lines and trims to a budget.
import type { EarningsEvent, MacroResponse, TickerResponse } from "../../shared/types";
import { co, curOf, epsOf, heldVia, resultOf, surprise, UNIVERSE } from "./data";
import { epsJudged, revenueBeatRate, revenueSkipped, revenueVerdict } from "../../shared/compare";
import { weekOf } from "./dates";
import type { Holding } from "./store";

const slimEvent = (e: EarningsEvent) => {
  const c = co(e.s);
  // A revenue actual on a different basis from its estimate (GOOGL net of TAC vs gross), or a hair under an estimate
  // revised after the print (0035), isn't passed as a fact to judge.
  const nc = revenueSkipped(revenueVerdict(e, curOf(e.s)));
  const ej = epsOf(e);
  const epsNC = ej.v === "not-comparable";
  // The estimate it was judged against (Nasdaq's when Finnhub's is on another basis), never a figure that contradicts `res`.
  return { s: e.s, n: c?.n, sec: c?.sec, mc: c?.mc, d: e.d, h: e.h, eE: ej.via ? ej.est : e.eE, eA: ej.act ?? e.eA, epsNC: epsNC || undefined, rE: e.rE, rA: nc ? null : e.rA, revNC: nc || undefined, cur: c?.ec, res: resultOf(e) ?? undefined };
};

export function slimMacro(m: MacroResponse | null | undefined, from: string, to: string) {
  if (!m) return undefined;
  return {
    mood: m.mood ? { score: m.mood.score, label: m.mood.label, components: m.mood.components.map((c) => ({ label: c.label, score: c.score, reading: c.reading })) } : undefined,
    events: m.events.filter((e) => e.date >= from && e.date <= to).map((e) => ({ date: e.date, name: e.name, blurb: e.blurb })),
  };
}

/** The week(s) ahead: the biggest tracked reporters by market cap, plus macro and mood. */
export function weekContext(events: EarningsEvent[], macro: MacroResponse | null | undefined, from: string, to: string, today: string, limit = 90) {
  const inRange = events.filter((e) => e.t && e.d >= from && e.d <= to);
  const top = [...inRange].sort((a, b) => (UNIVERSE[b.s]?.mc ?? 0) - (UNIVERSE[a.s]?.mc ?? 0)).slice(0, limit);
  return { today, range: { from, to }, total: inRange.length, events: top.sort((a, b) => a.d.localeCompare(b.d)).map(slimEvent), macro: slimMacro(macro, from, to) };
}

/** Which upcoming reports touch this portfolio — directly and through its funds. */
export function exposureContext(events: EarningsEvent[], holdings: Holding[], today: string) {
  const rows: { s: string; n?: string; d: string; h: string; dollars: number; via: string[] }[] = [];
  for (const e of events) {
    if (e.d < today) continue;
    const direct = holdings.find((h) => h.s === e.s);
    const via = heldVia(e.s, holdings);
    const dollars = (direct?.v ?? 0) + via.reduce((a, x) => a + x.dollars, 0);
    if (dollars > 0) rows.push({ s: e.s, n: co(e.s)?.n, d: e.d, h: e.h, dollars: Math.round(dollars), via: [...(direct ? ["direct"] : []), ...via.map((x) => x.etf)] });
  }
  rows.sort((a, b) => b.dollars - a.dollars);
  const weeks: Record<string, { dollars: number; names: string[] }> = {};
  for (const r of rows) { const k = weekOf(r.d)[0]; (weeks[k] ??= { dollars: 0, names: [] }); weeks[k].dollars += r.dollars; weeks[k].names.push(r.s); }
  return {
    total: holdings.reduce((a, h) => a + h.v, 0),
    holdings: holdings.slice(0, 40),
    rows: rows.slice(0, 40),
    weeks: Object.entries(weeks).sort().map(([week, v]) => ({ week, dollars: Math.round(v.dollars), names: v.names })),
  };
}

/** The month graded against consensus (same math as the Retrace page). */
export function retraceContext(events: EarningsEvent[], monthLabel: string) {
  const done = events.filter((e) => e.eA != null && e.t);
  const by = (k: string) => done.filter((e) => resultOf(e) === k).length;
  // 0049: an EPS on another basis from its estimate isn't judged, counted or ranked.
  const epsV = done.map(epsOf);
  const judgedEps = epsV.filter(epsJudged);
  const rev = revenueBeatRate(done, curOf);
  const sur = done.map(surprise).filter((x): x is number => x != null && Math.abs(x) < 500).sort((a, b) => a - b);
  const sectors: Record<string, { n: number; beat: number; s: number[] }> = {};
  for (const e of done) { if (resultOf(e) == null) continue; const k = co(e.s)?.sec || "Other"; (sectors[k] ??= { n: 0, beat: 0, s: [] }); sectors[k].n++; if (resultOf(e) === "beat") sectors[k].beat++; const x = surprise(e); if (x != null) sectors[k].s.push(x); }
  const ranked = done.filter((e) => surprise(e) != null && Math.abs(surprise(e)!) < 500).sort((a, b) => surprise(b)! - surprise(a)!);
  return {
    month: monthLabel,
    reported: done.length,
    epsBeatPct: judgedEps.length ? (judgedEps.filter((j) => j.v === "beat").length / judgedEps.length) * 100 : null,
    epsExcluded: epsV.filter((j) => j.v === "not-comparable").length,
    revBeatPct: rev.pct,
    revExcluded: rev.excluded,
    medianSurprise: sur.length ? sur[Math.floor(sur.length / 2)] : null,
    beat: by("beat"), mixed: by("mixed"), miss: by("miss"),
    sectors: Object.entries(sectors).filter(([, v]) => v.n >= 2).map(([sector, v]) => { const xs = v.s.sort((a, b) => a - b); return { sector, n: v.n, beatPct: (v.beat / v.n) * 100, median: xs.length ? xs[Math.floor(xs.length / 2)] : null }; }),
    topBeats: ranked.slice(0, 6).map(slimEvent),
    topMisses: ranked.slice(-6).reverse().map(slimEvent),
  };
}

/** The ticker sheet, minus the sparkline (the model doesn't need 126 closes). */
export function tickerContext(t: TickerResponse) {
  const { spark: _spark, warnings: _w, ...rest } = t;
  return rest;
}
