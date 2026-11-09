// Prompt building for every Metaphases AI surface. The model only ever sees facts we hand it,
// rendered as compact readable lines, trimmed to a budget. The system prompt carries the
// non-negotiables from AGENTS.md: plain English, cite the numbers, never advice, never invent.
import type { ChatMessage } from "./providers";
import { epsIn, isUsd, moneyIn } from "../../shared/currency";

export type AiTask = "ticker" | "week" | "exposure" | "retrace" | "ask" | "hype" | "kids";
export const TASKS: AiTask[] = ["ticker", "week", "exposure", "retrace", "ask", "hype", "kids"];
/** Tasks that must only ever run on the free brain (kid surfaces never use a grown-up's key). */
export const FREE_ONLY: AiTask[] = ["kids"];
export const isTask = (t: unknown): t is AiTask => typeof t === "string" && (TASKS as string[]).includes(t);

/** Character budget for the facts block (~4 chars per token → ~3.5k tokens). */
export const FACTS_BUDGET = 14_000;
const MAX_HISTORY = 6;
const MAX_QUESTION = 600;

export const SYSTEM = `You are the analyst inside Metaphases, an earnings calendar ("every earnings report, phase by phase"). You explain earnings season to two kinds of people at once: an active trader who wants specifics, and a first-time investor who doesn't know the jargon.

Rules you never break:
- Use ONLY the facts provided in this conversation. Cite the actual numbers (dates, EPS estimates, beat counts, typical moves, grades). If something isn't in the facts, say "I don't have that data" — never guess or invent figures, dates or news.
- Plain English. Explain any term the first time you use it, in a few words (e.g. "EPS (profit per share)").
- Never tell anyone to buy, sell or hold. No price targets. No confidence percentages or probabilities of a beat. Describe what the data shows and what would be worth watching instead.
- Grades are Metaphases' rules-based scores (A+ to F): "setup" = how the stock is positioned into the report; "Compass quality" = long-term business quality. Call them grades, not ratings or recommendations.
- Be concise and scannable: short paragraphs or "- " bullets, **bold** for the key number. No headings larger than bold text, no tables, no emoji.
- Report timing: "bmo" = before the open, "amc" = after the close, "dmh" = during market hours.
- Only if your answer touches a decision someone might make with money, end with one short line in italics: _Not investment advice — just what the data says._`;

/** Luna, the helper inside Metaphases Kids. Child-directed: simple, kind, on-topic, never advice, collects nothing. */
export const KIDS_SYSTEM = `You are Luna, a friendly moon who helps kids (about 8 to 12 years old) learn how money, companies and the stock market work. You live inside Metaphases Kids, where everything is pretend practice money.

Rules you never break:
- Use short sentences and simple words a 9-year-old can read. Answer in 2 to 5 sentences. Be warm and encouraging.
- Only talk about money, saving, companies, shares, earnings report cards and the stock market. If a kid asks about anything else, say: "That's a great question for a grown-up! I'm best at money and markets." Then suggest a money question they could ask you.
- Never tell anyone to buy or sell anything, and never tell them to use real money. Say it's pretend practice here, and that real money decisions are for grown-ups.
- Never ask for, guess or repeat personal information: no names, ages, schools, addresses, locations, photos or contact details. If a kid shares personal information, kindly say they shouldn't share that online, and don't repeat it.
- No scary, violent, adult or unkind content. If something feels unsafe, say: "Let's ask a grown-up about that!"
- Use only the facts provided. If you don't know, say "I'm not sure!" Don't make up numbers.
- No links. At most one emoji.`;

const TASK_BRIEF: Record<AiTask, string> = {
  kids: "Answer the kid's question using the facts if they help, in kid-friendly words. If they ask about a company, you can use its kid-friendly description and when it shares its report card. Keep it short, friendly and simple.",
  ticker: "Write a short earnings preview titled by nothing — start directly. Cover: when it reports and what Wall Street expects; how it has done versus estimates recently and how the stock has typically moved on reports; how it's set up going in (setup grade and its weakest/strongest factors); what's worth watching in this report. 120–180 words, 3–5 bullets after one opening sentence.",
  week: "Summarize the earnings and macro landscape in the facts for someone planning their week. Lead with the 2–4 biggest reports (by market cap) with day and timing, then the macro events that could move everything, then one line on market mood. Under 170 words unless the user asked something specific — then answer that, using the facts.",
  hype: "Someone saw this stock hyped on social media and wants a calm, honest take before doing anything. In under 150 words and plain English: say in one line what the company actually does; then what the real numbers show (profitability, how much it swings on earnings, the quality grade, when it reports next); then name the red flags listed in the facts, if any, in everyday words. Gently note that a viral post is not research and that the person posting may already own it. Never say buy, sell, hold, 'good investment' or 'bad investment'. Finish with the not-advice line.",
  exposure: "Explain, in plain English, how upcoming earnings reports touch this person's portfolio — directly and through the funds they own (look-through). Point out the biggest single exposures in dollars, the busiest week, and anything concentrated. Under 170 words.",
  retrace: "Explain what happened in this month's reports so far as if writing a short market recap: overall beat rates versus the usual ~75% EPS beat rate, the standout beats and misses, and which sectors did best/worst. Under 170 words.",
  ask: "Answer the user's question using the facts. If the facts can't answer it, say so and suggest what in Metaphases could (a ticker sheet, Compass, Retrace).",
};

// ── Facts rendering ─────────────────────────────────────────────────────────────────────────
type Obj = Record<string, any>;
const n = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const money = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;
};
/** A 3-letter currency code from untrusted context, or undefined (= USD). */
const cur3 = (c: unknown): string | undefined => (typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : c === "" ? "" : undefined);
const clip = (s: unknown, len = 80) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, len);

function tickerFacts(t: Obj): string[] {
  const L: string[] = [];
  const name = clip(t.profile?.name ?? t.symbol, 60);
  L.push(`Company: ${name} (${clip(t.symbol, 10)}), ${clip(t.profile?.industry ?? "", 40)}, market cap ${t.profile?.marketCap && (isUsd(cur3(t.next?.currency)) || !isUsd(cur3(t.profile.currency))) ? moneyIn(t.profile.marketCap * 1e6, cur3(t.profile.currency)) : "—"}.`);
  if (t.quote) L.push(`Price $${n(t.quote.price)} (${n(t.quote.changePct)}% today).`);
  // 0039: a report that's out, or whose session passed without figures, is never described as upcoming.
  if (t.justReported) L.push(`Just reported: Q${t.justReported.quarter} ${t.justReported.year} on ${clip(t.justReported.date, 10)}; EPS ${epsIn(t.justReported.epsA, cur3(t.justReported.currency))} against an estimate of ${epsIn(t.justReported.epsE, cur3(t.justReported.currency))}.`);
  if (t.next?.status === "results-pending") L.push(`Q${t.next.quarter} ${t.next.year} results were expected on ${clip(t.next.date, 10)} and are not in the data yet; do not describe this report as upcoming and do not guess the results.`);
  else if (t.next) L.push(`Next report: Q${t.next.quarter} ${t.next.year} ${t.next.closed || t.next.overdue ? "(date not confirmed yet)" : `on ${clip(t.next.date, 10)} ${clip(t.next.session || "time TBD", 4)}`}; consensus EPS ${epsIn(t.next.epsE, cur3(t.next.currency))}, revenue estimate ${moneyIn(t.next.revE, cur3(t.next.currency))}${isUsd(cur3(t.next.currency)) ? "" : ` (estimates in ${cur3(t.next.currency) || "local currency"}, not USD; never compare them with USD figures)`}.`);
  else L.push("Next report date: not available.");
  if (t.beatRate) L.push(`Beat the EPS estimate in ${t.beatRate.beats} of the last ${t.beatRate.total} reports.`);
  if (typeof t.expectedMove === "number") L.push(`Typical stock move on a report: ±${n(t.expectedMove, 1)}%.`);
  for (const h of (t.history ?? []).slice(0, 8)) {
    L.push(`Past report ${clip(h.date, 10)} (${clip(h.period, 12)}): EPS est $${n(h.epsE)} vs actual $${n(h.epsA)}, surprise ${n(h.surprisePct, 1)}%, stock moved ${h.move == null ? "—" : `${n(h.move, 1)}%`}.`);
  }
  for (const [label, g] of [["Setup grade", t.setup], ["Compass quality grade", t.compass]] as const) {
    if (!g) continue;
    const fs = (g.factors ?? []).map((f: Obj) => `${clip(f.label, 24)} ${f.grade ?? "—"} (${(f.inputs ?? []).map((i: Obj) => `${clip(i.label, 24)} ${clip(i.value, 24)}`).join(", ")})`).join("; ");
    L.push(`${label}: ${g.grade ?? "—"}${g.trend ? `, trend ${clip(g.trend, 24)}` : ""}. Factors: ${fs || "—"}.`);
  }
  if (t.street) L.push(`Analysts: ${t.street.buy} buy, ${t.street.hold} hold, ${t.street.sell} sell (${clip(t.street.period, 10)})${typeof t.street.buyPctChange3m === "number" ? `, buy share ${t.street.buyPctChange3m >= 0 ? "up" : "down"} ${n(Math.abs(t.street.buyPctChange3m), 0)} pts over 3 months` : ""}.`);
  return L;
}

function eventLine(e: Obj): string {
  const c = cur3(e.cur);
  if (!isUsd(c)) return `${clip(e.d, 10)} ${clip(e.h || "tbd", 4)} ${clip(e.s, 8)} ${clip(e.n ?? "", 40)}${e.sec ? ` [${clip(e.sec, 24)}]` : ""} EPS est ${epsIn(e.eE, c)}${e.eA != null ? ` actual ${epsIn(e.eA, c)}` : ""}${e.rE ? ` rev est ${moneyIn(e.rE, c)}` : ""}${e.rA && !e.revNC ? ` rev actual ${moneyIn(e.rA, c)}` : ""} (figures in ${c || "local currency"}, not USD)${e.res ? ` → ${clip(e.res, 6).toUpperCase()}` : ""}`;
  return `${clip(e.d, 10)} ${clip(e.h || "tbd", 4)} ${clip(e.s, 8)} ${clip(e.n ?? "", 40)}${e.sec ? ` [${clip(e.sec, 24)}]` : ""}${e.mc ? ` mcap ${money(e.mc * 1e6)}` : ""} EPS est ${n(e.eE)}${e.eA != null ? ` actual ${n(e.eA)}` : ""}${e.rE ? ` rev est ${money(e.rE)}` : ""}${e.rA && !e.revNC ? ` rev actual ${money(e.rA)}` : ""}${e.revNC ? " (reported revenue is on a different basis from the estimate; don't call it a revenue beat or miss)" : ""}${e.res ? ` → ${clip(e.res, 6).toUpperCase()}` : ""}`;
}

function macroLines(m: Obj | undefined): string[] {
  if (!m) return [];
  const L: string[] = [];
  if (m.mood) L.push(`Market Mood: ${m.mood.score}/100 (${clip(m.mood.label, 20)}). Components: ${(m.mood.components ?? []).map((c: Obj) => `${clip(c.label, 20)} ${c.score} (${clip(c.reading, 60)})`).join("; ")}.`);
  for (const e of (m.events ?? []).slice(0, 12)) L.push(`Macro: ${clip(e.date, 10)} ${clip(e.name, 30)} — ${clip(e.blurb, 140)}`);
  return L;
}

function weekFacts(c: Obj): string[] {
  const L: string[] = [];
  if (c.range) L.push(`Window: ${clip(c.range.from, 10)} to ${clip(c.range.to, 10)}. Today is ${clip(c.today, 10)}.`);
  if (typeof c.total === "number") L.push(`${c.total} tracked companies report in this window; the biggest are listed below (largest first).`);
  for (const e of c.events ?? []) L.push(eventLine(e));
  L.push(...macroLines(c.macro));
  return L;
}

function exposureFacts(c: Obj): string[] {
  const L: string[] = [];
  if (typeof c.total === "number") L.push(`Portfolio total: ${money(c.total)}. Holdings: ${(c.holdings ?? []).map((h: Obj) => `${clip(h.s, 8)} ${money(h.v)}`).join(", ")}.`);
  for (const r of c.rows ?? []) L.push(`${clip(r.d, 10)} ${clip(r.h || "tbd", 4)} ${clip(r.s, 8)} ${clip(r.n ?? "", 40)}: ${money(r.dollars)} of this portfolio exposed via ${(r.via ?? []).map((v: unknown) => clip(v, 8)).join(" + ")}.`);
  for (const w of c.weeks ?? []) L.push(`Week of ${clip(w.week, 10)}: ${money(w.dollars)} exposed (${(w.names ?? []).slice(0, 6).map((s: unknown) => clip(s, 8)).join(", ")}).`);
  return L;
}

function retraceFacts(c: Obj): string[] {
  const L: string[] = [];
  if (c.month) L.push(`Month: ${clip(c.month, 20)}. ${c.reported} tracked companies reported. EPS beat rate ${n(c.epsBeatPct, 0)}%, revenue beat rate ${n(c.revBeatPct, 0)}%${c.revExcluded ? ` (${n(c.revExcluded, 0)} reports left out: revenue on a different basis from the estimate)` : ""}, median EPS surprise ${n(c.medianSurprise, 1)}%. Beat both lines: ${c.beat}, mixed: ${c.mixed}, missed both: ${c.miss}.`);
  for (const s of c.sectors ?? []) L.push(`Sector ${clip(s.sector, 30)}: ${s.n} reports, ${n(s.beatPct, 0)}% beat both, median surprise ${n(s.median, 1)}%.`);
  for (const e of c.topBeats ?? []) L.push(`Top beat: ${eventLine(e)}`);
  for (const e of c.topMisses ?? []) L.push(`Top miss: ${eventLine(e)}`);
  return L;
}

export function factsFor(task: AiTask, context: Obj | null | undefined): string[] {
  const c = context ?? {};
  switch (task) {
    case "ticker": return tickerFacts(c);
    case "week": return weekFacts(c);
    case "exposure": return exposureFacts(c);
    case "hype": {
      const L = c.ticker ? tickerFacts(c.ticker) : [];
      for (const f of (c.flags ?? []).slice(0, 8)) L.push(`Red flag (from the data): ${clip(f.label, 80)} — ${clip(f.why, 160)}`);
      if (!(c.flags ?? []).length) L.push("Red flags found in the data: none of our checks fired.");
      if (c.owned) L.push(`This person already owns about ${clip(c.owned, 40)} of it through funds or directly.`);
      if (c.caption) L.push(`The social post they saw (quoted, may be wrong or promotional): "${clip(c.caption, 280)}"`);
      return L;
    }
    case "retrace": return retraceFacts(c);
    case "kids": {
      const L: string[] = [];
      if (c.weather) L.push(`Market weather today: ${clip(c.weather, 120)}.`);
      for (const k of (c.companies ?? []).slice(0, 12)) L.push(`${clip(k.nick, 30)} (${clip(k.s, 8)}) ${clip(k.hook, 80)}. Report card: ${clip(k.when ?? "not scheduled yet", 60)}.`);
      L.push("Everything in Metaphases Kids is pretend money that follows real prices. Nothing can be bought here.");
      return L;
    }
    case "ask": {
      const L: string[] = [];
      if (c.ticker) L.push(...tickerFacts(c.ticker));
      if (c.week) L.push(...weekFacts(c.week));
      if (c.exposure) L.push(...exposureFacts(c.exposure));
      if (c.retrace) L.push(...retraceFacts(c.retrace));
      return L;
    }
  }
}

/** Keep whole lines until the budget is spent; say so when facts were cut. */
export function trimToBudget(lines: string[], budget = FACTS_BUDGET): string {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.length + 1 > budget) { out.push(`(…${lines.length - out.length} more lines omitted for length)`); break; }
    out.push(l);
    used += l.length + 1;
  }
  return out.join("\n");
}

export interface PromptInput { task: AiTask; context?: Obj | null; question?: string; history?: { role: string; content: string }[] }

export function buildMessages(input: PromptInput): ChatMessage[] {
  const facts = trimToBudget(factsFor(input.task, input.context));
  const q = clip(input.question ?? "", MAX_QUESTION).trim();
  const msgs: ChatMessage[] = [{ role: "system", content: input.task === "kids" ? KIDS_SYSTEM : SYSTEM }];
  msgs.push({ role: "user", content: `Task: ${TASK_BRIEF[input.task]}\n\nFacts (the only data you may use):\n${facts || "(no facts available)"}` });
  msgs.push({ role: "assistant", content: "Understood. I'll use only those facts." });
  for (const h of (input.history ?? []).slice(-MAX_HISTORY)) {
    if ((h.role === "user" || h.role === "assistant") && typeof h.content === "string") msgs.push({ role: h.role, content: clip(h.content, 2000) });
  }
  // Roles must alternate (Anthropic enforces it): drop a dangling user turn before the new question.
  if (msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: q || "Go ahead." });
  return msgs;
}
