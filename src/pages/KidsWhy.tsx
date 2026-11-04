// "Why did it move?" card for Metaphases Kids (Story, Guess, Piggy). Reads /api/kids/why, which
// assembles the inputs from data we already fetch; the clues come from shared/kidsWhy.ts. Honest by
// design: ranked clues, a "we're not sure" when the numbers don't explain a move, never invented news.
import { useState } from "react";
import { whyMoved, type WhyInput, type WhyRange, type WhyResult } from "../../shared/kidsWhy";
import { KID_BY_SYMBOL } from "../../shared/kids";
import { Skeleton } from "../components/bits";
import { useApi } from "../lib/api";
import { BASE } from "../lib/router";
import { todayISO } from "../lib/dates";
import { W } from "./KidsQuest";
import { LESSONS } from "../../shared/kidsContent";
import { navigate } from "../lib/router";

export interface WhyResponse { input: WhyInput; why: WhyResult; warnings: string[] }
const ICON: Record<string, string> = { report: "📝", market: "🌍", company: "🏪", sector: "👥", dividend: "🍰", wiggle: "〰️", unknown: "🤷" };

/** Kid-readable clues for one company's day (1d) or week (5d). */
export function WhyCard({ s, range = "1d", title = "Why did it move?" }: { s: string; range?: WhyRange; title?: string }) {
  const [r, setR] = useState<WhyRange>(range);
  const q = useApi<WhyResponse>(KID_BY_SYMBOL[s] ? `${BASE}/api/kids/why?s=${s}&range=${r}` : null);
  const co = KID_BY_SYMBOL[s];
  if (!co) return null;
  // Recompute from the inputs so the words always come from this build's engine (same as the app).
  const why = q.data?.input ? whyMoved({ ...q.data.input, nick: co?.nick ?? q.data.input.nick }, todayISO()) : null;
  return (
    <section className="k-section k-why" aria-label={`${title} ${co.nick}`}>
      <h2><span aria-hidden>🔍</span> {title}</h2>
      <div className="k-why-tabs" role="group" aria-label="How long">
        {(["1d", "5d"] as const).map((x) => <button key={x} className={`k-chip${r === x ? " on" : ""}`} aria-pressed={r === x} onClick={() => setR(x)}>{x === "1d" ? "One day" : "One week"}</button>)}
      </div>
      {q.loading && !why ? <Skeleton h={90} /> : !why ? (
        <p className="k-small">We can't see {co.nick}'s clues right now. Try again in a little while!</p>
      ) : (
        <>
          <p className="k-why-head"><span aria-hidden>{co.emoji}</span> <b>{why.headline}</b> {why.sizeLine}</p>
          <ol className="k-why-clues">
            {why.causes.map((c, i) => (
              <li key={c.id} className={`k-why-clue k-why-${c.id}`}>
                <span aria-hidden>{ICON[c.id]}</span>
                <span><b>{i === 0 && c.id !== "unknown" ? "Biggest clue: " : ""}{c.title}.</b> {c.line}{(() => { const l = LESSONS.find((x) => x.id === c.learn); return l ? <> <button className="k-link" onClick={() => navigate(`/kids/school/${l.id}`)}>Learn it: {l.title}</button></> : null; })()}</span>
              </li>
            ))}
          </ol>
          <p className="k-small k-why-honest">{why.honest} <W k="wiggle">What's a wiggle?</W></p>
        </>
      )}
    </section>
  );
}
