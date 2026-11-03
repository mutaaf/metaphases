// Metaphases Kids — the Market Moon Club. A child-directed surface for ~9-year-olds:
// pretend money that follows real prices, report-card guessing, Moon School and Luna the helper.
// Safety promises (AGENTS.md): no real money, nothing to buy, no ads, no accounts, no data leaves
// the device, no links out of kids mode, free AI only with the kid-safe prompt.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EarningsEvent, Session } from "../../shared/types";
import {
  badgesFor, BADGES, basketTip, biggestMover, buyPretend, evenSplit, expectLine, holdingChange, KID_BY_SYMBOL, KID_COMPANIES, kidWhen,
  lastTimeLine, levelFor, LEVELS, MAX_PICKS, ofTheDay, piggyValue, pointsFor, resolveGuess, resolvePrice, START_COINS, weatherFor, whyLine,
  type KidCo, type Pick, type Weather,
} from "../../shared/kids";
import { KID_WORDS, LESSONS, lessonUnit, UNITS, type Lesson, type Quiz, type Step } from "../../shared/kidsContent";
import {
  buildRecap, decodeLeague, encodeLeague, leagueRows, PLAYER_NAMES, PLAYERS, recapLines, recapQuery, type LeagueGuess, type LeaguePlayer, type Recap,
} from "../../shared/kidsWeek";
import { Markdown } from "../components/ai/Markdown";
import { Skeleton, Spark, Tile } from "../components/bits";
import { streamAi } from "../lib/ai";
import { useApi, useCalendar, useMacro, useTicker } from "../lib/api";
import { addDays, todayISO } from "../lib/dates";
import { useDialog } from "../lib/dialog";
import { kids, kidsState, useKids } from "../lib/kidsStore";
import { encodeTransfer } from "../../shared/kidsTransfer";
import { appPath, BASE, href, navigate, useLocation } from "../lib/router";
import { actions } from "../lib/store";
import { chaptersDone } from "../../shared/kidsQuestContent";
import { QuestPage, StartHere, W, WordChips } from "./KidsQuest";
import { VoiceCorner } from "./KidsVoice";
import { AppNudge, AppPage } from "./KidsAppPage";
import { PrivacyPage } from "./KidsPrivacy";
import { WhyCard } from "./KidsWhy";
import { guessReveal, piggyTip } from "../../shared/kidsCoach";
import { CORE_PACK } from "../../shared/kidsContent";
import { canSpeak, markKidTyped, speakText, useVoiceSettings } from "../lib/voice";
import "../styles/kids.css";

const progressOf = (st: ReturnType<typeof useKids>) => ({ guesses: st.guesses, lessons: st.lessons, piggy: !!st.piggy, piggyCount: st.piggy?.holdings.length ?? 0, quest: st.questDone, chapters: chaptersDone(st.quest, st.questDone) });

// ── Little pieces ───────────────────────────────────────────────────────────────────────────
/** Luna, the club's moon. Mostly lit, with a calm face. */
export function Luna({ size = 48, wave = false }: { size?: number; wave?: boolean }) {
  return (
    <svg className={`luna${wave ? " luna-wave" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="28" fill="var(--k-moon)" stroke="var(--k-ink)" strokeWidth="2.5" />
      <path d="M32 4a28 28 0 0 0 0 56a17 28 0 0 1 0-56z" fill="var(--k-moon-shade)" opacity=".55" />
      <circle cx="25" cy="29" r="2.6" fill="var(--k-ink)" />
      <circle cx="41" cy="29" r="2.6" fill="var(--k-ink)" />
      <path d="M25 38q7 6 14 0" fill="none" stroke="var(--k-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="21" cy="36" r="3" fill="var(--k-blush)" opacity=".7" />
      <circle cx="45" cy="36" r="3" fill="var(--k-blush)" opacity=".7" />
    </svg>
  );
}

/** Moon-phase badge art: 0 = new moon … 4 = full moon. */
export function MoonPhase({ phase, size = 40, dim = false }: { phase: number; size?: number; dim?: boolean }) {
  const r = 16;
  const lit = "var(--accent)";
  const p = Math.max(0, Math.min(4, phase));
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`moonp${dim ? " dim" : ""}`} aria-hidden>
      <circle cx="20" cy="20" r={r} fill="var(--k-card)" stroke={lit} strokeWidth="2.5" />
      {p === 4 && <circle cx="20" cy="20" r={r} fill={lit} />}
      {p === 2 && <path d={`M20 4a${r} ${r} 0 0 1 0 ${2 * r}z`} fill={lit} />}
      {p === 1 && <path d={`M20 4a${r} ${r} 0 0 1 0 ${2 * r}a${r * 0.6} ${r} 0 0 0 0-${2 * r}z`} fill={lit} />}
      {p === 3 && <path d={`M20 4a${r} ${r} 0 0 1 0 ${2 * r}a${r * 0.6} ${r} 0 0 1 0-${2 * r}z`} fill={lit} />}
    </svg>
  );
}

function WeatherArt({ w }: { w: Weather }) {
  return (
    <div className={`k-weather k-w-${w.icon}`} aria-hidden>
      <span className="k-weather-sun" />
      <Luna size={92} />
      <span className="k-weather-cloud c1" />
      <span className="k-weather-cloud c2" />
      <span className="k-weather-rain" />
    </div>
  );
}

/** Big 🔊 button: reads the card out loud (early readers). The device's friendliest voice, or a
 *  grown-up's warmer OpenAI/Gemini voice set up behind the gate (src/lib/voice.ts). Hidden when neither works. */
export function ReadAloud({ text, label = "Read it to me" }: { text: string; label?: string }) {
  useVoiceSettings();
  const [loading, setLoading] = useState(false);
  if (!canSpeak()) return null;
  const go = async (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    setLoading(true);
    try { await speakText(text); } finally { setLoading(false); }
  };
  return (
    <button className={`k-speak${loading ? " loading" : ""}`} onClick={go} aria-busy={loading} aria-label={`${label}: read this out loud`}>
      <span aria-hidden>{loading ? "…" : "🔊"}</span> {label}
    </button>
  );
}

function Pretend({ children = "PRETEND MONEY" }: { children?: ReactNode }) {
  return <span className="k-pretend" title="This is practice money. It isn't real and can't buy anything.">🌙 {children}</span>;
}
const coins = (v: number) => `🌙 $${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Stable answer order per question, so the right answer isn't always first. */
function shuffled(q: { q: string; options: string[] }, seed: number): { text: string; i: number }[] {
  const opts = q.options.map((text, i) => ({ text, i }));
  const k = (seed * 7 + q.q.length) % opts.length;
  return [...opts.slice(k), ...opts.slice(0, k)];
}

// ── Data shared by Story, Guess and Ask ─────────────────────────────────────────────────────
function useKidEvents() {
  const today = todayISO();
  const cal = useCalendar(addDays(today, -30), addDays(today, 21));
  const events = useMemo(() => ((cal.data?.events ?? []) as EarningsEvent[]).filter((e) => e.s in KID_BY_SYMBOL), [cal.data]);
  const upcoming = useMemo(() => events.filter((e) => e.d >= today).sort((a, b) => a.d.localeCompare(b.d) || a.s.localeCompare(b.s)), [events, today]);
  return { today, events, upcoming, loading: cal.loading && !cal.data, error: cal.error };
}

// ── Story (home) ────────────────────────────────────────────────────────────────────────────
type KidStory =
  | { kind: "recap"; r: Recap }
  | { kind: "weather"; w: Weather; score: number }
  | { kind: "report"; e: EarningsEvent; co: KidCo }
  | { kind: "why"; s: string }
  | { kind: "word" }
  | { kind: "quiz" }
  | { kind: "next" };

function ReportStory({ e, co, today }: { e: EarningsEvent; co: KidCo; today: string }) {
  const { data } = useTicker(e.s);
  const last = data?.history.find((h) => h.move != null)?.move ?? null;
  const read = `${co.nick} ${co.hook}. It shares its report card ${kidWhen(e.d, e.h, today)}. ${expectLine(e.eE)} ${data ? lastTimeLine(last) : ""}`;
  return (
    <>
      <span className="k-eyebrow">Report card day!</span>
      <div className="k-co">
        <span className="k-co-emoji" aria-hidden>{co.emoji}</span>
        <div><h2>{co.nick}</h2><p>{co.hook}.</p></div>
      </div>
      <p className="k-when"><MoonPhase phase={e.h === "dmh" ? 4 : e.h === "bmo" ? 1 : e.h === "amc" ? 3 : 0} size={30} /><span>Shares its report card <b>{kidWhen(e.d, e.h, today)}</b>.</span></p>
      <p className="k-line">{expectLine(e.eE)}</p>
      <p className="k-line k-last">{data ? lastTimeLine(last) : <Skeleton w="80%" h={18} />}</p>
      <div className="k-card-actions">
        <ReadAloud text={read} />
        <button className="k-btn k-btn-primary" onClick={(ev) => { ev.stopPropagation(); navigate("/kids/guess"); }}>Guess: beat or miss? 🎯</button>
      </div>
      <WordChips ks={["company", "report", "guess", "profit"]} />
    </>
  );
}

function QuizCard({ q, seed }: { q: Quiz; seed: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <span className="k-eyebrow">Quick quiz</span>
      <h2 className="k-q">{q.q}</h2>
      <div className="k-answers">
        {shuffled(q, seed).map((o) => (
          <button key={o.i} className={`k-answer${picked === o.i ? (o.i === q.answer ? " right" : " wrong") : ""}`} onClick={(e) => { e.stopPropagation(); setPicked(o.i); }} aria-pressed={picked === o.i}>
            {o.text}
          </button>
        ))}
      </div>
      {picked != null && <p className="k-feedback" role="status">{picked === q.answer ? "🎉 Yes! " : "Good try! "}{q.why}</p>}
      <div className="k-card-actions"><ReadAloud text={`${q.q} ${q.options.join(". Or, ")}.`} /></div>
    </>
  );
}

// ── Weekly recap (0027) ─────────────────────────────────────────────────────────────────────
function useRecap(): Recap | null {
  const st = useKids();
  const today = todayISO();
  const points = pointsFor(progressOf(st));
  return useMemo(() => buildRecap({ guesses: st.guesses, lessonDates: st.lessonDates, piggy: st.piggy, points, level: levelFor(points).index }, today), [st, today, points]);
}

function RecapCard({ r }: { r: Recap }) {
  const [gate, setGate] = useState(false);
  const [share, setShare] = useState(false);
  const ls = recapLines(r);
  return (
    <>
      <span className="k-eyebrow">{r.label} in the Moon Club</span>
      <div className="k-recap-head"><MoonPhase phase={r.level} size={72} /><h2>Look what you did!</h2></div>
      <ul className="k-recap-stats" aria-label="Your week">
        <li><b>{r.guesses}</b><span>{r.guesses === 1 ? "guess" : "guesses"}</span></li>
        <li><b>{r.right}</b><span>right</span></li>
        <li><b>{r.lessons}</b><span>{r.lessons === 1 ? "lesson" : "lessons"}</span></li>
        {r.piggyPct != null && <li><b>{r.piggyPct > 0 ? "+" : ""}{r.piggyPct.toFixed(1)}%</b><span>piggy bank</span></li>}
      </ul>
      <ul className="k-recap-lines">{ls.map((l) => <li key={l}>{l}</li>)}</ul>
      <div className="k-card-actions">
        <ReadAloud text={ls.join(" ")} />
        <button className="k-btn k-btn-primary" onClick={(e) => { e.stopPropagation(); setGate(true); }}>Show a grown-up 👀</button>
      </div>
      {/* Dialogs sit inside the swipeable card: keep their clicks from turning the page. */}
      <span onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        {gate && <ParentGate onPass={() => { setGate(false); setShare(true); }} onClose={() => setGate(false)} />}
        {share && <RecapShare r={r} onClose={() => setShare(false)} />}
      </span>
    </>
  );
}

/** Behind the parental gate: the recap as a 9:16 image a grown-up can save or share. */
function RecapShare({ r, onClose }: { r: Recap; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let url = "";
    fetch(`${BASE}/og/story/kids-recap.png?${recapQuery(r)}`)
      .then((x) => (x.ok ? x.blob() : Promise.reject()))
      .then((blob) => { url = URL.createObjectURL(blob); setImg({ url, blob }); })
      .catch(() => setErr(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);
  const file = img ? new File([img.blob], "moon-club-week.png", { type: "image/png" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const save = () => {
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.url; a.download = "moon-club-week.png"; a.click();
  };
  return (
    <div className="drawer-scrim center" onClick={onClose}>
      <div className="k-gate k-share" ref={ref} role="dialog" aria-modal="true" aria-labelledby="k-share-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="k-share-t">Their week, as a picture</h2>
        <p className="k-small">Only counts and a percent. No names, no prices, nothing personal.</p>
        {img ? <img className="k-share-img" src={img.url} alt={`Weekly recap: ${recapLines(r).join(" ")}`} /> : err ? <p role="alert">The picture didn't load. Try again in a minute.</p> : <Skeleton h={320} />}
        <div className="k-nav">
          <button className="k-btn" onClick={onClose}>Close</button>
          {canShare ? (
            <button className="k-btn k-btn-primary" onClick={() => navigator.share({ files: [file!], title: "Our week in the Moon Club" }).catch(() => {})}>Share</button>
          ) : (
            <button className="k-btn k-btn-primary" disabled={!img} onClick={save}>Save image</button>
          )}
        </div>
      </div>
    </div>
  );
}

function StoryPage() {
  const { today, upcoming, loading } = useKidEvents();
  const macro = useMacro();
  const [i, setI] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const word = ofTheDay(KID_WORDS, today);
  const allQuiz = useMemo(() => LESSONS.flatMap((l) => l.quiz), []);
  const quiz = ofTheDay(allQuiz, today, 3);
  const recap = useRecap();
  const { recapSeen, piggy, guesses } = useKids();
  // "Why did it move?": a company the kid cares about (their piggy bank, their latest guess), else Disney.
  const whySym = piggy?.holdings[0]?.s ?? [...guesses].sort((a, b) => b.d.localeCompare(a.d))[0]?.s ?? "DIS";

  const stories: KidStory[] = useMemo(() => {
    const out: KidStory[] = [];
    const fresh = recap?.active && recapSeen !== recap.from;
    if (recap?.active && fresh) out.push({ kind: "recap", r: recap });
    if (macro.data?.mood) out.push({ kind: "weather", w: weatherFor(macro.data.mood.score), score: macro.data.mood.score });
    const seen = new Set<string>();
    for (const e of upcoming) {
      if (out.filter((s) => s.kind === "report").length >= 3) break;
      if (seen.has(e.s) || e.d > addDays(today, 10)) continue;
      seen.add(e.s);
      out.push({ kind: "report", e, co: KID_BY_SYMBOL[e.s] });
    }
    out.push({ kind: "why", s: whySym }, { kind: "word" }, { kind: "quiz" });
    if (recap?.active && !fresh) out.push({ kind: "recap", r: recap });
    out.push({ kind: "next" });
    return out;
  }, [macro.data, upcoming, today, recap, recapSeen, whySym]);
  const n = stories.length;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[role=dialog]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n]);
  const s = stories[Math.min(i, n - 1)];
  // Once the recap has been seen, it moves to the end of the cards next time (no nagging).
  const sawRecap = useRef<string | null>(null);
  if (s?.kind === "recap") sawRecap.current = s.r.from;
  useEffect(() => () => { if (sawRecap.current) kids.closeRecap(sawRecap.current); }, []);

  return (
    <div className="k-page">
      <header className="k-hero">
        <Luna size={64} wave />
        <div>
          <span className="k-eyebrow">{new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <h1>Today's <em>Market Story</em></h1>
        </div>
      </header>
      <StartHere />
      <AppNudge />
      {loading && macro.loading ? (
        <div className="k-story"><Skeleton h={28} w="50%" /><Skeleton h={120} /><Skeleton h={60} /></div>
      ) : (
        <>
          <div className="k-dots" role="tablist" aria-label="Story cards">
            {stories.map((_, k) => <button key={k} role="tab" aria-selected={k === i} aria-label={`Card ${k + 1} of ${n}`} className={k < i ? "done" : k === i ? "on" : ""} onClick={() => setI(k)}><i /></button>)}
          </div>
          <article
            className={`k-story k-story-${s.kind}`}
            aria-live="polite"
            aria-label={`Card ${i + 1} of ${n}`}
            onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); go(e.clientX - r.left < r.width / 3 ? -1 : 1); }}
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const t0 = touch.current; touch.current = null; if (!t0) return;
              const dx = e.changedTouches[0].clientX - t0.x;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            {s.kind === "weather" && (
              <>
                <span className="k-eyebrow">Market weather</span>
                <WeatherArt w={s.w} />
                <h2>{s.w.title} {s.w.emoji}</h2>
                <p className="k-line">{s.w.line}</p>
                <p className="k-small">Grown-ups check a "mood meter" for the market. Today it says {s.score} out of 100. 0 is very scared, 100 is very brave.</p>
                <div className="k-card-actions"><ReadAloud text={`Market weather: ${s.w.title}. ${s.w.line}`} /></div>
                <WordChips ks={["mood", "stock", "share"]} />
              </>
            )}
            {s.kind === "recap" && <RecapCard r={s.r} />}
            {s.kind === "report" && <ReportStory e={s.e} co={s.co} today={today} />}
            {s.kind === "why" && <WhyCard s={s.s} />}
            {s.kind === "word" && (
              <>
                <span className="k-eyebrow">Big word of the day</span>
                <h2 className="k-word">{word.word}</h2>
                <p className="k-line">{word.means}</p>
                <p className="k-example">Example: {word.example}</p>
                <div className="k-card-actions"><ReadAloud text={`${word.word}. ${word.means} For example: ${word.example}`} /></div>
              </>
            )}
            {s.kind === "quiz" && <QuizCard key={today} q={quiz} seed={i} />}
            {s.kind === "next" && (
              <>
                <span className="k-eyebrow">What's next?</span>
                <h2>Pick an adventure</h2>
                <div className="k-adventures">
                  <button className="k-adv" onClick={() => navigate("/kids/guess")}><span aria-hidden>🎯</span><b>Guess the Report Card</b><small>Will a company beat or miss?</small></button>
                  <button className="k-adv" onClick={() => navigate("/kids/piggy")}><span aria-hidden>🐷</span><b>Pretend Piggy Bank</b><small>Spend 🌙 $1,000 pretend coins</small></button>
                  <button className="k-adv" onClick={() => navigate("/kids/school")}><span aria-hidden>🎓</span><b>Moon School</b><small>Short lessons, shiny badges</small></button>
                </div>
              </>
            )}
            <footer className="k-story-foot"><span>{i + 1} / {n} · tap or swipe</span></footer>
          </article>
          <div className="k-nav">
            <button className="k-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous card">← Back</button>
            <button className="k-btn k-btn-primary" onClick={() => go(1)} disabled={i >= n - 1} aria-label="Next card">Next →</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Guess the Report Card ───────────────────────────────────────────────────────────────────
function Reveal({ g, e }: { g: { s: string; d: string; pick: Pick; price?: "up" | "down"; result?: "right" | "wrong"; priceResult?: "right" | "wrong" }; e: EarningsEvent }) {
  const co = KID_BY_SYMBOL[g.s];
  const { data } = useTicker(g.price ? g.s : null);
  const res = resolveGuess(g.pick, e);
  const move = data?.history.find((h) => h.date === g.d)?.move;
  const pr = resolvePrice(g.price, move);
  const shown = !!g.result;
  const reveal = () => {
    if (res !== "right" && res !== "wrong") return;
    kids.resolve(g.s, g.d, { result: res, ...(pr === "right" || pr === "wrong" ? { priceResult: pr } : {}) });
  };
  useEffect(() => { if (shown && !g.priceResult && (pr === "right" || pr === "wrong")) kids.resolve(g.s, g.d, { priceResult: pr }); }, [shown, pr]);
  return (
    <li className={`k-guess ${shown ? `k-res-${g.result}` : ""}`}>
      <span className="k-co-emoji sm" aria-hidden>{co.emoji}</span>
      <div className="k-guess-body">
        <b>{co.nick}</b>
        <span className="k-small">You guessed <b>{g.pick === "beat" ? "BEAT 👍" : "MISS 👎"}</b>{g.price ? ` and price ${g.price === "up" ? "UP ⬆️" : "DOWN ⬇️"}` : ""}.</span>
        {!shown ? (
          res === "pending" ? <span className="k-small">⏳ Waiting for the report card {kidWhen(g.d, e.h, todayISO())}.</span>
            : res === "unknown" ? <span className="k-small">This report card didn't have a grown-up guess, so nobody wins this one.</span>
            : <button className="k-btn k-btn-primary" onClick={reveal}>The report card is out! Reveal 🎁</button>
        ) : (
          <div className="k-result" role="status">
            <b className="k-result-title">{g.result === "right" ? "🎉 You got it right! +10" : "🌧️ Markets surprise everyone!"}</b>
            <span>{whyLine(co.nick, e)}</span>
            {g.price && (g.priceResult ? <span>The price went {move != null && move >= 0 ? "up" : "down"}{move != null ? ` ${Math.abs(move).toFixed(1)}%` : ""}: {g.priceResult === "right" ? "you were right! +5" : "not this time."}</span> : <span className="k-small">We'll know the price part soon.</span>)}
            {move != null && <span className="k-small">{guessReveal(CORE_PACK.guess!, { eA: e.eA, eE: e.eE, move })}</span>}
            {g.result === "wrong" && <span className="k-small">{CORE_PACK.guess!.reveal.tryAgain}</span>}
            <WhyCard s={g.s} range="5d" title="Why did the price move?" />
          </div>
        )}
      </div>
    </li>
  );
}

function GuessPage() {
  const { today, events, upcoming, loading } = useKidEvents();
  const { guesses } = useKids();
  const [price, setPrice] = useState<Record<string, "up" | "down">>({});
  const key = (e: { s: string; d: string }) => `${e.s}:${e.d}`;
  const guessed = new Set(guesses.map(key));
  const open = upcoming.filter((e) => !guessed.has(key(e))).slice(0, 8);
  const byKey = new Map(events.map((e) => [key(e), e]));
  const mine = [...guesses].sort((a, b) => a.d.localeCompare(b.d));
  return (
    <div className="k-page">
      <header className="k-hero">
        <span className="k-hero-emoji" aria-hidden>🎯</span>
        <div><span className="k-eyebrow">A guessing game</span><h1>Guess the <em>Report Card</em></h1></div>
      </header>
      <p className="k-intro">Before a <W k="company" /> shares its <W k="report" />, grown-ups guess its <W k="profit" />. Will the company <W k="beat"><b>beat</b></W> that guess (do better) or <W k="miss"><b>miss</b></W> (do worse)? Make your guess, then come back to see!</p>
      <ReadAloud text="Before a company shares its report card, grown-ups guess its profit. Will the company beat that guess, or miss? Make your guess, then come back to see." />

      <LeagueBoard events={events} />

      {mine.length > 0 && (
        <section className="k-section">
          <h2>Your guesses</h2>
          <ul className="k-guesses">{mine.map((g) => { const e = byKey.get(key(g)); return e ? <Reveal key={key(g)} g={g} e={e} /> : (
            <li key={key(g)} className="k-guess"><span className="k-co-emoji sm" aria-hidden>{KID_BY_SYMBOL[g.s]?.emoji}</span><div className="k-guess-body"><b>{KID_BY_SYMBOL[g.s]?.nick ?? g.s}</b><span className="k-small">{g.result ? (g.result === "right" ? "🎉 You were right!" : "🌧️ Not this time.") : "⏳ Waiting for the report card."}</span></div></li>
          ); })}</ul>
        </section>
      )}

      <section className="k-section">
        <h2>Coming up</h2>
        {loading ? <Skeleton h={120} /> : !open.length ? (
          <p className="k-intro">No new report cards from companies you know in the next three weeks. Try Moon School while you wait! 🎓</p>
        ) : (
          <ul className="k-upcoming">
            {open.map((e) => {
              const co = KID_BY_SYMBOL[e.s];
              const make = (pick: Pick) => kids.guess({ s: e.s, d: e.d, pick, price: price[key(e)], at: today });
              return (
                <li key={key(e)} className="k-up">
                  <div className="k-up-head">
                    <span className="k-co-emoji" aria-hidden>{co.emoji}</span>
                    <div><b>{co.nick}</b><span className="k-small">{co.hook} · report card {kidWhen(e.d, e.h as Session, today)}</span></div>
                  </div>
                  <p className="k-small">{expectLine(e.eE)}</p>
                  <div className="k-price-pick" role="group" aria-label={`Bonus: will ${co.nick}'s price go up or down?`}>
                    <span className="k-small">Bonus: will the price go up or down?</span>
                    <button className={`k-chip${price[key(e)] === "up" ? " on" : ""}`} aria-pressed={price[key(e)] === "up"} onClick={() => setPrice({ ...price, [key(e)]: "up" })}>Up ⬆️</button>
                    <button className={`k-chip${price[key(e)] === "down" ? " on" : ""}`} aria-pressed={price[key(e)] === "down"} onClick={() => setPrice({ ...price, [key(e)]: "down" })}>Down ⬇️</button>
                  </div>
                  <div className="k-pick">
                    <button className="k-big k-beat" onClick={() => make("beat")} aria-label={`Guess ${co.nick} will beat`}>Beat 👍</button>
                    <button className="k-big k-miss" onClick={() => make("miss")} aria-label={`Guess ${co.nick} will miss`}>Miss 👎</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Pretend Piggy Bank ──────────────────────────────────────────────────────────────────────
interface QuotesResponse { quotes: Record<string, { price: number; changePct: number; prevClose: number }>; warnings: string[] }

function PiggySetup() {
  const today = todayISO();
  const [picks, setPicks] = useState<string[]>([]);
  const [split, setSplit] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = START_COINS - Object.values(split).reduce((a, b) => a + b, 0);
  const toggle = (s: string) => {
    const next = picks.includes(s) ? picks.filter((x) => x !== s) : picks.length < MAX_PICKS ? [...picks, s] : picks;
    setPicks(next);
    setSplit(evenSplit(next));
  };
  const bump = (s: string, d: number) => {
    const v = (split[s] ?? 0) + d;
    if (v < 0 || (d > 0 && left < d)) return;
    setSplit({ ...split, [s]: v });
  };
  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/api/quotes?s=${picks.join(",")}`);
      const j = (await r.json()) as QuotesResponse;
      const prices = Object.fromEntries(Object.entries(j.quotes ?? {}).map(([s, q]) => [s, q.price]));
      const h = buyPretend(split, prices);
      if (!h.length) throw new Error("no prices");
      kids.startPiggy(h, today, piggyValue(h, prices));
    } catch {
      setErr("Hmm, we couldn't get prices right now. Try again in a minute!");
    } finally { setBusy(false); }
  };
  return (
    <>
      <p className="k-intro">You have <b>🌙 $1,000 pretend coins</b>. Pick up to 5 <W k="company">companies</W> you know. Your coins buy pretend <W k="share">shares</W> that follow their <W k="price">real prices</W>, but it's all pretend. Nothing is bought for real.</p>
      <ReadAloud text="You have one thousand pretend coins. Pick up to five companies you know. Your coins will follow their real prices, but it's all pretend. Nothing is bought for real." />
      <ul className="k-pickgrid" aria-label="Companies you can pick">
        {KID_COMPANIES.map((c) => {
          const on = picks.includes(c.s);
          return (
            <li key={c.s}>
              <button className={`k-pickco${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(c.s)} disabled={!on && picks.length >= MAX_PICKS}>
                <span aria-hidden>{c.emoji}</span><b>{c.nick}</b>
              </button>
            </li>
          );
        })}
      </ul>
      {picks.length > 0 && (
        <section className="k-section k-split" aria-label="Split your coins">
          <h2>Split your coins <Pretend /></h2>
          {picks.map((s) => (
            <div key={s} className="k-split-row">
              <span aria-hidden>{KID_BY_SYMBOL[s].emoji}</span><b>{KID_BY_SYMBOL[s].nick}</b>
              <button className="k-round" onClick={() => bump(s, -100)} aria-label={`100 fewer coins for ${KID_BY_SYMBOL[s].nick}`}>−</button>
              <span className="k-split-v">{coins(split[s] ?? 0)}</span>
              <button className="k-round" onClick={() => bump(s, 100)} aria-label={`100 more coins for ${KID_BY_SYMBOL[s].nick}`} disabled={left < 100}>+</button>
            </div>
          ))}
          <p className="k-small">{left > 0 ? `${coins(left)} left to place.` : "All your coins are placed!"} <button className="k-link" onClick={() => setSplit(evenSplit(picks))}>Split evenly</button></p>
          <p className="k-tip">🧺 {picks.length === 1 ? "Tip: " : ""}{basketTip(picks.length)}</p>
          <button className="k-btn k-btn-primary k-wide" disabled={left !== 0 || busy} onClick={start}>{busy ? "Filling your piggy bank…" : "Start my pretend piggy bank 🐷"}</button>
          {err && <p className="k-feedback" role="alert">{err}</p>}
        </section>
      )}
    </>
  );
}

function PiggyView() {
  const { piggy } = useKids();
  const today = todayISO();
  const syms = piggy?.holdings.map((h) => h.s) ?? [];
  const q = useApi<QuotesResponse>(syms.length ? `${BASE}/api/quotes?s=${syms.join(",")}` : null);
  const prices = useMemo(() => Object.fromEntries(Object.entries(q.data?.quotes ?? {}).map(([s, x]) => [s, x.price])), [q.data]);
  const value = piggy ? piggyValue(piggy.holdings, prices) : 0;
  useEffect(() => { if (q.data && piggy) kids.recordValue(today, value); }, [q.data]);
  const [confirm, setConfirm] = useState(false);
  if (!piggy) return null;
  const change = value - START_COINS;
  const mover = q.data ? biggestMover(piggy.holdings, prices) : null;
  const hist = Object.entries(piggy.history).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  return (
    <>
      <section className="k-bank" aria-label="Your pretend money">
        <Pretend />
        <span className="k-eyebrow">Your pretend money today</span>
        {q.loading && !q.data ? <Skeleton h={56} w={200} /> : <b className="k-bank-v">{coins(value)}</b>}
        {q.data && Math.abs(change) >= 0.5 && <span className={`k-bank-ch ${change >= 0 ? "up" : "down"}`}>{change >= 0 ? "⬆️ Up" : "⬇️ Down"} {coins(Math.abs(change)).replace("🌙 ", "")} since you started</span>}
        {hist.length >= 2 ? <Spark data={hist} w={240} h={48} /> : <span className="k-small">Come back tomorrow to watch your line grow. 📈</span>}
        <ReadAloud text={`Your pretend money today is ${Math.round(value)} coins. You started with one thousand.`} />
      </section>
      {mover && Math.abs(mover.change) < 0.05 && (
        <p className="k-tip">📅 Prices move a little every day. Come back tomorrow to see which company moved the most!</p>
      )}
      {mover && Math.abs(mover.change) >= 0.05 && (
        <p className="k-tip">
          {KID_BY_SYMBOL[mover.s].emoji} <b>{KID_BY_SYMBOL[mover.s].nick}</b> moved the most: {mover.change >= 0 ? "up" : "down"} {Math.abs(mover.change).toFixed(1)}% since you started.
          {" "}{mover.change >= 0 ? "Lots of people wanted its shares, so the price went up." : "More people were selling its shares, so the price went down. That's normal!"}
        </p>
      )}
      <ul className="k-holdings">
        {piggy.holdings.map((h) => {
          const c = holdingChange(h, prices[h.s]);
          return (
            <li key={h.s}>
              <span className="k-co-emoji sm" aria-hidden>{KID_BY_SYMBOL[h.s]?.emoji}</span>
              <div><b>{KID_BY_SYMBOL[h.s]?.nick ?? h.s}</b><span className="k-small">You put in {coins(h.coins)}</span></div>
              {Math.abs(c) < 0.05
                ? <span className="k-hold-ch flat">New! 🌱</span>
                : <span className={`k-hold-ch ${c >= 0 ? "up" : "down"}`}>{c >= 0 ? "+" : ""}{c.toFixed(1)}%</span>}
            </li>
          );
        })}
      </ul>
      <section className="k-basket" aria-label="Eggs in baskets">
        <div className="k-baskets" aria-hidden>{piggy.holdings.map((h) => <span key={h.s} className="k-basket-i">🧺<i>{KID_BY_SYMBOL[h.s]?.emoji}</i></span>)}</div>
        <p className="k-tip">{q.data ? piggyTip(CORE_PACK.piggy!, { holdings: piggy.holdings.length, started: piggy.started, today, value, start: START_COINS, peeks: 0 }).text : basketTip(piggy.holdings.length)}</p>
      </section>
      {mover && Math.abs(mover.change) >= 0.05 && <WhyCard s={mover.s} title={`Why did ${KID_BY_SYMBOL[mover.s]?.nick ?? mover.s} move?`} />}
      <div className="k-reset">
        {!confirm ? <button className="k-link" onClick={() => setConfirm(true)}>Start over with new pretend coins</button> : (
          <span>Start over? Your pretend bank will be emptied. <button className="k-btn" onClick={() => { kids.resetPiggy(); setConfirm(false); }}>Yes, start over</button> <button className="k-link" onClick={() => setConfirm(false)}>No, keep it</button></span>
        )}
      </div>
    </>
  );
}

function PiggyPage() {
  const { piggy } = useKids();
  return (
    <div className="k-page">
      <header className="k-hero">
        <span className="k-hero-emoji" aria-hidden>🐷</span>
        <div><span className="k-eyebrow">Practice with pretend coins</span><h1>Pretend <em>Piggy Bank</em></h1></div>
      </header>
      {piggy ? <PiggyView /> : <PiggySetup />}
    </div>
  );
}

// ── Moon School ─────────────────────────────────────────────────────────────────────────────
function Badges() {
  const st = useKids();
  const have = new Set(badgesFor(progressOf(st), LESSONS.length));
  return (
    <section className="k-section" aria-label="Your badges">
      <h2>Your moon badges</h2>
      <ul className="k-badges">
        {BADGES.map((b) => (
          <li key={b.id} className={have.has(b.id) ? "got" : ""}>
            <MoonPhase phase={b.phase} size={52} dim={!have.has(b.id)} />
            <b>{b.name}</b>
            <span className="k-small">{have.has(b.id) ? b.why : "Not yet!"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SchoolPage() {
  const { lessons } = useKids();
  const next = LESSONS.find((l) => !lessons.includes(l.id));
  return (
    <div className="k-page">
      <header className="k-hero">
        <span className="k-hero-emoji" aria-hidden>🎓</span>
        <div><span className="k-eyebrow">{lessons.length} of {LESSONS.length} done · about a minute each</span><h1>Moon <em>School</em></h1></div>
      </header>
      <StartHere />
      {next && (
        <button className="k-upnext" onClick={() => navigate(`/kids/school/${next.id}`)}>
          <span className="k-upnext-emoji" aria-hidden>{next.emoji}</span>
          <span className="k-starthere-t"><span className="k-eyebrow">Up next · {lessonUnit(next).title}</span><b>{next.title}</b><small>{next.steps.length} tiny steps</small></span>
          <span className="k-starthere-go" aria-hidden>→</span>
        </button>
      )}
      {UNITS.map((u) => {
        const ls = LESSONS.filter((l) => l.unit === u.id);
        const done = ls.filter((l) => lessons.includes(l.id)).length;
        return (
          <section key={u.id} className="k-unit" aria-label={u.title}>
            <header className="k-unit-head">
              <span className="k-unit-emoji" aria-hidden>{u.emoji}</span>
              <div><h2>{u.title}</h2><span className="k-small">{u.blurb}</span></div>
              <span className={`k-unit-count${done === ls.length ? " full" : ""}`}>{done === ls.length ? "🌕" : `${done}/${ls.length}`}</span>
            </header>
            <ul className="k-lessons">
              {ls.map((l) => {
                const isDone = lessons.includes(l.id);
                return (
                  <li key={l.id}>
                    <button className={`k-lesson${isDone ? " done" : ""}`} onClick={() => navigate(`/kids/school/${l.id}`)}>
                      <span className="k-lesson-emoji" aria-hidden>{l.emoji}</span>
                      <span className="k-lesson-t"><b>{l.title}</b><span className="k-small">{l.steps.length} steps · 1 min</span></span>
                      <span className="k-lesson-done" aria-label={isDone ? "Finished" : "Not started"}>{isDone ? "🌕" : "🌑"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <Badges />
    </div>
  );
}

function CheckStep({ step, seed, picked, onPick }: { step: Extract<Step, { t: "check" }>; seed: number; picked: number | undefined; onPick: (i: number) => void }) {
  return (
    <>
      <span className="k-eyebrow">Quick check</span>
      <h2 className="k-q">{step.q}</h2>
      <div className="k-answers">
        {shuffled(step, seed).map((o) => (
          <button key={o.i} className={`k-answer${picked === o.i ? (o.i === step.answer ? " right" : " wrong") : ""}`} aria-pressed={picked === o.i} onClick={() => onPick(o.i)}>{o.text}</button>
        ))}
      </div>
      {picked != null && <p className="k-feedback" role="status">{picked === step.answer ? "🎉 Yes! " : "Good try! "}{step.why}</p>}
      <div className="k-card-actions"><ReadAloud text={`${step.q} ${step.options.join(". Or, ")}.`} /></div>
    </>
  );
}

function SortStep({ step, picks, onPick }: { step: Extract<Step, { t: "sort" }>; picks: Record<number, 0 | 1>; onPick: (item: number, b: 0 | 1) => void }) {
  const all = step.items.every((_, i) => picks[i] != null);
  const right = step.items.filter((it, i) => picks[i] === it.b).length;
  return (
    <>
      <span className="k-eyebrow">Sorting game</span>
      <h2 className="k-q">{step.q}</h2>
      <ul className="k-sort">
        {step.items.map((it, i) => {
          const p = picks[i];
          return (
            <li key={it.text} className={p == null ? "" : p === it.b ? "right" : "wrong"}>
              <span className="k-sort-item"><span aria-hidden>{it.emoji}</span> {it.text}</span>
              <span className="k-sort-btns" role="group" aria-label={it.text}>
                {step.buckets.map((bk, b) => (
                  <button key={bk} className={`k-chip${p === b ? " on" : ""}`} aria-pressed={p === b} onClick={() => onPick(i, b as 0 | 1)}>{bk}</button>
                ))}
              </span>
              {p != null && <span className="k-sort-mark" aria-label={p === it.b ? "right" : `not quite: ${step.buckets[it.b]}`}>{p === it.b ? "✅" : `↩︎ ${step.buckets[it.b]}`}</span>}
            </li>
          );
        })}
      </ul>
      {all && <p className="k-feedback" role="status">{right === step.items.length ? "🎉 All right! " : `${right} of ${step.items.length} right. `}{step.why}</p>}
      <div className="k-card-actions"><ReadAloud text={`${step.q} ${step.items.map((x) => x.text).join(". ")}.`} /></div>
    </>
  );
}

function LessonPage({ lesson }: { lesson: Lesson }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [sorts, setSorts] = useState<Record<number, Record<number, 0 | 1>>>({});
  const total = lesson.steps.length;
  const done = step >= total;
  const cur = done ? null : lesson.steps[step];
  const ready = !cur || cur.t === "say" || (cur.t === "check" && answers[step] != null) || (cur.t === "sort" && cur.items.every((_, i) => sorts[step]?.[i] != null));
  const unit = lessonUnit(lesson);
  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const nx = LESSONS[idx + 1];
  useEffect(() => { if (done) kids.finishLesson(lesson.id, todayISO()); }, [done]);
  return (
    <div className="k-page">
      <button className="k-link k-back" onClick={() => navigate("/kids/school")}>← Moon School</button>
      <header className="k-hero k-hero-lesson">
        <span className="k-hero-emoji" aria-hidden>{lesson.emoji}</span>
        <div><span className="k-eyebrow">{unit.emoji} {unit.title} · {done ? "Finished!" : `Step ${step + 1} of ${total}`}</span><h1>{lesson.title}</h1></div>
      </header>
      <div className="k-steps" aria-hidden>{lesson.steps.map((x, i) => <i key={i} className={`${i < step ? "done" : i === step ? "on" : ""} t-${x.t}`} />)}</div>
      <article className={`k-story k-lesson-card${cur ? ` k-step-${cur.t}` : ""}`} aria-live="polite" key={step}>
        {cur?.t === "say" && (
          <>
            <span className="k-say-emoji" aria-hidden>{cur.emoji}</span>
            <p className="k-lesson-text">{cur.text}</p>
            <div className="k-card-actions"><ReadAloud text={cur.text} /></div>
          </>
        )}
        {cur?.t === "check" && <CheckStep step={cur} seed={step + lesson.id.length} picked={answers[step]} onPick={(i) => setAnswers({ ...answers, [step]: i })} />}
        {cur?.t === "sort" && <SortStep step={cur} picks={sorts[step] ?? {}} onPick={(i, b) => setSorts({ ...sorts, [step]: { ...(sorts[step] ?? {}), [i]: b } })} />}
        {done && (
          <div className="k-celebrate" role="status">
            <MoonPhase phase={4} size={96} />
            <h2>Lesson done! 🎉</h2>
            <p className="k-line">You filled a moon and earned 10 points.</p>
          </div>
        )}
      </article>
      <div className="k-nav">
        {!done ? (
          <>
            <button className="k-btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button>
            <button className="k-btn k-btn-primary" onClick={() => setStep(step + 1)} disabled={!ready}>{step === total - 1 ? "Finish 🌕" : "Next →"}</button>
          </>
        ) : (
          <>
            <button className="k-btn" onClick={() => navigate("/kids/school")}>All lessons</button>
            {nx && <button className="k-btn k-btn-primary" onClick={() => navigate(`/kids/school/${nx.id}`)}>Next lesson →</button>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Ask Luna ────────────────────────────────────────────────────────────────────────────────
const LUNA_CHIPS = ["What is a share?", "Why do prices go up and down?", "What is a company's report card?", "What does Disney sell?", "Is the market sunny today?", "Why shouldn't I put all my eggs in one basket?"];

function AskPage() {
  const { today, upcoming } = useKidEvents();
  const macro = useMacro();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const ask = async (question: string) => {
    const text = question.trim().slice(0, 200);
    if (!text || busy) return;
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    markKidTyped(text); // a kid typed this: it is never sent to a voice provider
    setAsked(text); setAnswer(""); setErr(null); setBusy(true); setQ("");
    const w = macro.data?.mood ? weatherFor(macro.data.mood.score) : null;
    const nextBy = new Map<string, EarningsEvent>();
    for (const e of upcoming) if (!nextBy.has(e.s)) nextBy.set(e.s, e);
    const context = {
      weather: w ? `${w.title}: ${w.line}` : undefined,
      companies: KID_COMPANIES.map((k) => ({ s: k.s, nick: k.nick, hook: k.hook, when: nextBy.get(k.s) ? kidWhen(nextBy.get(k.s)!.d, nextBy.get(k.s)!.h, today) : undefined })),
    };
    try {
      let out = "";
      for await (const ev of streamAi({ task: "kids", context, question: text, signal: c.signal })) {
        if ("t" in ev) { out += ev.t; setAnswer(out); }
        else if ("error" in ev) { setErr("Luna is resting right now. Try again in a little while! 🌙"); break; }
      }
    } catch {
      if (!c.signal.aborted) setErr("Luna is resting right now. Try again in a little while! 🌙");
    } finally { setBusy(false); }
  };
  return (
    <div className="k-page">
      <header className="k-hero">
        <Luna size={64} wave />
        <div><span className="k-eyebrow">Your money helper</span><h1>Ask <em>Luna</em></h1></div>
      </header>
      <p className="k-intro">Luna knows about money, companies and the market. Tap a question!</p>
      <div className="k-chips">{LUNA_CHIPS.map((c) => <button key={c} className="k-chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
      <form className="k-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="k-ask-in" className="k-small">Or type your own money question</label>
        <div className="k-ask-row">
          <input id="k-ask-in" value={q} maxLength={200} autoComplete="off" onChange={(e) => setQ(e.target.value)} placeholder="Why do companies sell shares?" />
          <button className="k-btn k-btn-primary" disabled={busy || !q.trim()}>Ask</button>
        </div>
        <span className="k-small">Please don't type your name, school or where you live.</span>
      </form>
      {(asked || busy) && (
        <section className="k-answer-box" aria-live="polite">
          <p className="k-asked">You asked: <b>{asked}</b></p>
          <div className="k-luna-says">
            <Luna size={40} />
            <div>{answer ? <Markdown text={answer} /> : err ? null : <span className="k-thinking">Luna is thinking<span>.</span><span>.</span><span>.</span></span>}
              {err && <p className="k-feedback" role="alert">{err}</p>}
              {answer && !busy && <ReadAloud text={answer} label="Read Luna's answer" />}
            </div>
          </div>
        </section>
      )}
      <p className="k-small k-note">Luna is a computer helper, so she can make mistakes. For real money questions, ask a grown-up you trust.</p>
    </div>
  );
}

// ── Grown-up corner + parental gate ─────────────────────────────────────────────────────────
let gatePassed = false;
export const gateQuestion = (seed: number) => { const a = 6 + (seed % 4), b = 6 + ((seed >> 2) % 4); return { a, b, answer: a * b }; };

function ParentGate({ onPass, onClose }: { onPass: () => void; onClose: () => void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 16));
  const { a, b, answer } = gateQuestion(seed);
  const [v, setV] = useState("");
  const [wrong, setWrong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { initialFocus: "input" });
  return (
    <div className="drawer-scrim center" onClick={onClose}>
      <div className="k-gate" ref={ref} role="dialog" aria-modal="true" aria-labelledby="k-gate-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="k-gate-t">For grown-ups</h2>
        <p>Please answer to continue:</p>
        <form onSubmit={(e) => { e.preventDefault(); if (Number(v) === answer) { gatePassed = true; onPass(); } else { setWrong(true); setV(""); } }}>
          <label className="k-gate-q" htmlFor="k-gate-in">What is {a} × {b}?</label>
          <input id="k-gate-in" inputMode="numeric" pattern="[0-9]*" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 3))} autoComplete="off" />
          {wrong && <p className="k-feedback" role="alert">That's not it. Ask a grown-up for help!</p>}
          <div className="k-nav"><button type="button" className="k-btn" onClick={onClose}>Back to kids</button><button className="k-btn k-btn-primary">Continue</button></div>
        </form>
      </div>
    </div>
  );
}

/** Grown-ups only: send Moon Club to another parent (native share sheet, or copy the link). */
function ShareWithParent() {
  const [done, setDone] = useState<string | null>(null);
  const url = `${location.origin}${BASE}/kids`;
  const text = "Moon Club teaches kids how money works: one-minute lessons, a lemonade-stand game and a pretend piggy bank on real prices. Ages 8–12, no ads, no sign-up.";
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "Moon Club — money, explained for kids", text, url }); setDone("Shared!"); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); setDone("Link copied. Paste it into a message.");
    } catch { /* closed the share sheet */ }
  };
  return (
    <section className="k-section k-share-parent">
      <div><h2>Share with another parent</h2><p className="k-small">A link with a preview card. Nothing about your child is included.</p></div>
      <button className="k-btn k-btn-primary" onClick={share}>Share Moon Club</button>
      {done && <p className="k-feedback" role="status">{done}</p>}
    </section>
  );
}

/** Grown-ups only: move this browser's progress into the Moon Club iPhone/iPad app by copy and paste. */
function MoveToApp() {
  const [code, setCode] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setDone("Copied. In Moon Club, open For grown-ups → Move my progress and paste."); }
    catch { setDone("Select the code and copy it by hand."); }
  };
  return (
    <section className="k-section k-move" aria-label="Move progress to the app">
      <div>
        <h2>Move progress to the app</h2>
        <p className="k-small">Lessons, quests, badges, guesses and the pretend piggy bank travel in one code. Copy it here and paste it in the Moon Club app. Nothing is uploaded, and pasting twice is fine.</p>
      </div>
      {!code
        ? <button className="k-btn k-btn-primary" onClick={() => setCode(encodeTransfer(kidsState()))}>Make my progress code</button>
        : <>
            <textarea className="k-move-code" readOnly value={code} rows={3} aria-label="Progress code" onFocus={(e) => e.currentTarget.select()} />
            <button className="k-btn k-btn-primary" onClick={copy}>Copy code</button>
          </>}
      {done && <p className="k-feedback" role="status">{done}</p>}
    </section>
  );
}

function GrownUps() {
  const [ok, setOk] = useState(gatePassed);
  if (!ok) return <ParentGate onPass={() => setOk(true)} onClose={() => navigate("/kids")} />;
  return (
    <div className="k-page k-grownups">
      <header className="k-hero"><Luna size={56} /><div><span className="k-eyebrow">Grown-up corner</span><h1>About <em>Metaphases Kids</em></h1></div></header>
      <ShareWithParent />
      <AppNudge />
      <MoveToApp />
      <section className="k-section">
        <h2>What kids learn</h2>
        <ul className="k-list">
          <li>What a company, a share and a profit are, in plain words.</li>
          <li>How prices move when more people want to buy or sell.</li>
          <li>What an earnings "report card" is, and what "beat" and "miss" mean, using real companies they know.</li>
          <li>Why spreading money out is safer, practised with a pretend piggy bank that follows real prices.</li>
          <li>Patience, and the difference between hype and facts.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Our promises</h2>
        <ul className="k-list">
          <li><b>Pretend money only.</b> Nothing can be bought, sold or paid for. There's no broker and no "buy" button.</li>
          <li><b>No data collected.</b> No accounts, no sign-up, no analytics. Progress is saved only in this browser.</li>
          <li><b>No ads and no links out</b> of kids mode.</li>
          <li><b>Luna, the AI helper,</b> uses a free model with a kid-safe prompt: simple words, money topics only, never advice, and she never asks for personal details. She can still make mistakes, so stay nearby.</li>
          <li>Nothing here is investment advice.</li>
          <li><a href={href("/kids/privacy")} onClick={(e) => { e.preventDefault(); navigate("/kids/privacy"); }}>Read the full privacy policy</a></li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Printable worksheets</h2>
        <p className="k-small">One page per Moon School lesson: the idea, the quiz, a drawing box and a find-it-at-home task. The answer key is at the bottom.</p>
        <ul className="k-sheets">
          {LESSONS.map((l, i) => <li key={l.id}><button className="k-lesson" onClick={() => navigate(`/kids/school/${l.id}/print`)}><span className="k-lesson-emoji" aria-hidden>{l.emoji}</span><span className="k-lesson-t"><span className="k-small">Worksheet {i + 1}</span><b>{l.title}</b></span><span aria-hidden>🖨️</span></button></li>)}
        </ul>
      </section>
      <VoiceCorner />
      <LeagueSetup />
      <section className="k-section">
        <h2>Conversation starters</h2>
        <ul className="k-list">
          <li>"Which companies do we buy things from every week?"</li>
          <li>"If you had $10, would you save it or invest it? Why?"</li>
          <li>"Why do you think the price went down even though they beat?"</li>
          <li>"How could we check if a video about a stock is true?"</li>
        </ul>
      </section>
      <div className="k-nav">
        <button className="k-btn" onClick={() => navigate("/kids")}>Back to kids</button>
        <button className="k-btn k-btn-primary" onClick={() => { actions.setPref("lens", "everyday"); navigate("/"); }}>Go to the grown-up Metaphases</button>
      </div>
    </div>
  );
}


// ── Printable worksheets (0029) — grown-up corner only ─────────────────────────────────────
function WorksheetPage({ lesson }: { lesson: Lesson }) {
  const [ok, setOk] = useState(gatePassed);
  useEffect(() => { document.title = `Worksheet: ${lesson.title} · Metaphases Kids`; }, [lesson.id]);
  if (!ok) return <div className="kids"><ParentGate onPass={() => setOk(true)} onClose={() => navigate("/kids/school")} /></div>;
  const n = LESSONS.findIndex((l) => l.id === lesson.id) + 1;
  const letters = ["A", "B", "C", "D"];
  return (
    <div className="k-sheet-wrap">
      <div className="k-sheet-tools">
        <button className="k-btn" onClick={() => navigate("/kids/grownups")}>← Grown-up corner</button>
        <button className="k-btn k-btn-primary" onClick={() => window.print()}>Print this worksheet 🖨️</button>
      </div>
      <article className="k-sheet" aria-label={`Worksheet: ${lesson.title}`}>
        <header className="k-sheet-head">
          <Luna size={56} />
          <div>
            <span className="k-sheet-eyebrow">Market Moon Club · Moon School · Lesson {n}</span>
            <h1>{lesson.emoji} {lesson.title}</h1>
          </div>
          <div className="k-sheet-name">Name: <span /></div>
        </header>
        <section className="k-sheet-read">
          <h2>Read it</h2>
          {lesson.screens.map((t) => <p key={t}>{t}</p>)}
        </section>
        <section className="k-sheet-quiz">
          <h2>Circle the answer</h2>
          {lesson.quiz.map((q, qi) => (
            <div key={q.q} className="k-sheet-q">
              <b>{qi + 1}. {q.q}</b>
              <ul>{q.options.map((o, i) => <li key={o}><span className="k-sheet-bubble">{letters[i]}</span>{o}</li>)}</ul>
            </div>
          ))}
        </section>
        {lesson.steps.filter((x): x is Extract<Step, { t: "sort" }> => x.t === "sort").map((x) => (
          <section key={x.q} className="k-sheet-sort">
            <h2>Sort it</h2>
            <b>{x.q} Write {x.buckets.map((b) => `“${b}”`).join(" or ")}.</b>
            <ul>{x.items.map((it) => <li key={it.text}>{it.emoji} {it.text} <span className="k-sheet-blank" /></li>)}</ul>
          </section>
        ))}
        <div className="k-sheet-row">
          <section className="k-sheet-draw"><h2>Draw it</h2><p>Draw a picture that shows the big idea of this lesson.</p><div className="k-sheet-box" /></section>
          <section className="k-sheet-find">
            <h2>Find it at home</h2>
            <p>Find something at home made by a company. Which company made it?</p>
            <div className="k-sheet-line" /><div className="k-sheet-line" />
            <p>What does that company sell?</p>
            <div className="k-sheet-line" />
          </section>
        </div>
        <footer className="k-sheet-key" aria-label="Answer key">
          <span>Answer key: {lesson.quiz.map((q, i) => `${i + 1}. ${letters[q.answer]} (${q.options[q.answer]})`).join("   ")}{lesson.steps.flatMap((x) => (x.t === "sort" ? x.items.map((it) => ` · ${it.text}: ${x.buckets[it.b]}`) : [])).join("")}</span>
        </footer>
        <p className="k-sheet-foot">Metaphases Kids · pretend money, real prices · no ads, nothing to buy</p>
      </article>
    </div>
  );
}

// ── Family League (0028) ────────────────────────────────────────────────────────────────────
function LeagueSetup() {
  const st = useKids();
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const code = st.me != null ? encodeLeague({ emoji: st.me, guesses: st.guesses }) : "";
  const add = () => {
    const r = decodeLeague(paste);
    if (!r.ok) { setMsg({ ok: false, text: r.why }); return; }
    if (r.player.emoji === st.me) { setMsg({ ok: false, text: `That's this device's own player (${PLAYERS[r.player.emoji]}). Each player needs a different emoji.` }); return; }
    kids.addPlayer(r.player);
    setPaste("");
    setMsg({ ok: true, text: `${PLAYERS[r.player.emoji]} ${PLAYER_NAMES[r.player.emoji]} joined with ${r.player.guesses.length} ${r.player.guesses.length === 1 ? "guess" : "guesses"}.` });
  };
  return (
    <section className="k-section k-league-setup">
      <h2>Family league</h2>
      <p className="k-small">Siblings (or you!) guess the same report cards on different devices, then compare. Each player picks an emoji instead of a name. A code holds only the company, the date and the guess. Nothing goes to a server.</p>
      <div>
        <b>1. This device's player</b>
        <div className="k-emoji-pick" role="radiogroup" aria-label="This device's player">
          {PLAYERS.map((e, i) => (
            <button key={e} role="radio" aria-checked={st.me === i} aria-label={PLAYER_NAMES[i]} className={st.me === i ? "on" : ""} onClick={() => kids.setMe(i)}>{e}</button>
          ))}
        </div>
      </div>
      {st.me != null && (
        <div className="k-code">
          <b>2. Send this code to the other device</b>
          <div className="k-ask-row">
            <input readOnly value={code} aria-label="This player's league code" onFocus={(e) => e.currentTarget.select()} />
            <button className="k-btn" onClick={() => { navigator.clipboard?.writeText(code).then(() => setCopied(true), () => {}); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <span className="k-small">{st.guesses.length ? `Holds the last ${Math.min(st.guesses.length, 20)} guesses.` : "No guesses yet: make some on Guess first."} Make a new code after new guesses.</span>
        </div>
      )}
      <form className="k-code" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label htmlFor="k-league-in"><b>3. Paste a code from another device</b></label>
        <div className="k-ask-row">
          <input id="k-league-in" value={paste} onChange={(e) => { setPaste(e.target.value.slice(0, 140)); setMsg(null); }} placeholder="MOON-1…" autoComplete="off" spellCheck={false} />
          <button className="k-btn k-btn-primary" disabled={!paste.trim()}>Add player</button>
        </div>
        {msg && <p className="k-feedback" role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </form>
      {st.league.length > 0 && (
        <ul className="k-players">
          {st.league.map((p) => (
            <li key={p.emoji}><span aria-hidden>{PLAYERS[p.emoji]}</span> {PLAYER_NAMES[p.emoji]} · {p.guesses.length} {p.guesses.length === 1 ? "guess" : "guesses"} <button className="k-link" onClick={() => kids.removePlayer(p.emoji)}>Remove</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LeagueBoard({ events }: { events: EarningsEvent[] }) {
  const st = useKids();
  if (!st.league.length) return null;
  const meEmoji = st.me ?? 0;
  const players: LeaguePlayer[] = [{ emoji: meEmoji, guesses: st.guesses }, ...st.league];
  const rows = leagueRows(players, 8);
  const byKey = new Map(events.map((e) => [`${e.s}:${e.d}`, e]));
  // This device's own guesses may already be revealed (stored result) even when the event is out of range.
  const res = (g: LeagueGuess & { result?: "right" | "wrong" }) => {
    const r = resolveGuess(g.pick, byKey.get(`${g.s}:${g.d}`));
    return r === "pending" && g.result ? g.result : r;
  };
  const score = players.map((p) => p.guesses.filter((g) => res(g) === "right").length);
  const best = Math.max(...score);
  return (
    <section className="k-section k-league" aria-label="Family league">
      <h2>Family league 🏆</h2>
      <div className="k-league-scroll">
        <table>
          <thead>
            <tr><th scope="col">Report card</th>{players.map((p, i) => <th key={i} scope="col"><span className="k-league-p" aria-label={i === 0 ? `You (${PLAYER_NAMES[p.emoji]})` : PLAYER_NAMES[p.emoji]}>{PLAYERS[p.emoji]}</span>{i === 0 && <small>you</small>}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const co = KID_BY_SYMBOL[r.s];
              return (
                <tr key={r.key}>
                  <th scope="row"><span aria-hidden>{co?.emoji}</span> {co?.nick ?? r.s}<small>{new Date(r.d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</small></th>
                  {r.picks.map((g, i) => {
                    if (!g) return <td key={i} className="k-lg-none" aria-label="No guess">·</td>;
                    const rr = res(g);
                    const mark = rr === "right" ? "✅" : rr === "wrong" ? "❌" : "⏳";
                    return <td key={i} className={`k-lg-${rr}`} aria-label={`${g.pick}, ${rr === "pending" || rr === "unknown" ? "waiting" : rr}`}>{g.pick === "beat" ? "👍" : "👎"}<span aria-hidden>{mark}</span></td>;
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><th scope="row">Right</th>{score.map((n, i) => <td key={i} className={n === best && n > 0 ? "k-lg-best" : ""}>{n}{n === best && n > 0 ? " 🌕" : ""}</td>)}</tr>
          </tfoot>
        </table>
      </div>
      <p className="k-small">👍 beat · 👎 miss · ✅ right · ❌ not this time · ⏳ waiting. Everyone is learning. Even experts guess wrong a lot!</p>
    </section>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────────────────────
const KTABS = [
  { path: "/kids", label: "Story", icon: "📖" },
  { path: "/kids/guess", label: "Guess", icon: "🎯" },
  { path: "/kids/piggy", label: "Piggy Bank", icon: "🐷" },
  { path: "/kids/school", label: "Moon School", icon: "🎓" },
  { path: "/kids/ask", label: "Ask Luna", icon: "🌙" },
];

function NewBadgeToast() {
  const st = useKids();
  const have = badgesFor(progressOf(st), LESSONS.length);
  const fresh = have.filter((b) => !st.seenBadges.includes(b));
  // A moment of celebration, then out of the way (it used to sit on top of the page until tapped).
  useEffect(() => { if (!fresh.length) return; const t = setTimeout(() => kids.seeBadges(fresh), 6000); return () => clearTimeout(t); }, [fresh.join()]);
  if (!fresh.length) return null;
  const b = BADGES.find((x) => x.id === fresh[0])!;
  return (
    <div className="k-toast" role="status">
      <MoonPhase phase={b.phase} size={44} />
      <div><b>New badge: {b.name}!</b><span>{b.why}</span></div>
      <button className="k-btn k-btn-primary" onClick={() => kids.seeBadges(fresh)}>Yay!</button>
    </div>
  );
}

/** Kids mode wears Luna in the tab and on the home screen, even when entered by in-app navigation. */
function useKidsIcon() {
  useEffect(() => {
    const swaps: [HTMLLinkElement | HTMLMetaElement, string, string][] = [];
    const swap = (sel: string, attr: string, val: string) => document.querySelectorAll<HTMLLinkElement | HTMLMetaElement>(sel).forEach((el) => { swaps.push([el, attr, el.getAttribute(attr) ?? ""]); el.setAttribute(attr, val); });
    swap('link[rel="icon"][type="image/svg+xml"]', "href", `${BASE}/kids-icon.svg`);
    swap('link[rel="icon"][type="image/png"]', "href", `${BASE}/kids-icon-512.png`);
    swap('link[rel="apple-touch-icon"]', "href", `${BASE}/kids-apple-touch-icon.png`);
    swap('meta[name="apple-mobile-web-app-title"]', "content", "Moon Club");
    return () => swaps.forEach(([el, attr, v]) => el.setAttribute(attr, v));
  }, []);
}

export default function KidsApp() {
  useLocation();
  useKidsIcon();
  const path = appPath();
  const st = useKids();
  const [gate, setGate] = useState(false);
  const points = pointsFor(progressOf(st));
  const lvl = levelFor(points);
  useEffect(() => { if (!path.endsWith("/print")) document.title = path === "/kids/privacy" ? "Privacy policy · Moon Club and Metaphases Kids" : "Metaphases Kids: the Market Moon Club"; window.scrollTo({ top: 0 }); }, [path]);
  const lessonId = path.match(/^\/kids\/school\/([a-z-]+)(\/print)?$/);
  const lesson = lessonId ? LESSONS.find((l) => l.id === lessonId[1]) : undefined;
  if (lesson && lessonId?.[2]) return <WorksheetPage lesson={lesson} />;
  const body =
    path === "/kids/guess" ? <GuessPage /> :
    path === "/kids/piggy" ? <PiggyPage /> :
    path === "/kids/school" ? <SchoolPage /> :
    lesson ? <LessonPage key={lesson.id} lesson={lesson} /> :
    path === "/kids/ask" ? <AskPage /> :
    path === "/kids/start" ? <QuestPage key={location.search} /> :
    path === "/kids/grownups" ? <GrownUps /> :
    path === "/kids/app" ? <AppPage Gate={ParentGate} /> :
    path === "/kids/privacy" ? <PrivacyPage /> :
    <StoryPage />;
  const tabOn = (t: string) => (t === "/kids" ? path === "/kids" : path.startsWith(t));
  return (
    <div className="kids">
      <a className="skip-link" href="#k-main">Skip to content</a>
      <header className="k-top">
        <a className="k-brand" href={href("/kids")} onClick={(e) => { e.preventDefault(); navigate("/kids"); }} aria-label="Market Moon Club home">
          <Luna size={34} /><span><b>Market Moon Club</b><small>Metaphases Kids</small></span>
        </a>
        <div className="k-level" aria-label={`Level: ${lvl.name}, ${points} points`} title={`${points} points`}>
          <MoonPhase phase={lvl.index} size={30} />
          <span><b>{lvl.name}</b><small>{points} pts{lvl.next != null ? ` · ${lvl.next - points} to ${LEVELS[lvl.index + 1].name}` : ""}</small></span>
        </div>
        <button className="k-grown" aria-label="For grown-ups" onClick={() => setGate(true)}><span className="k-grown-for">For </span>grown-ups</button>
      </header>
      <main id="k-main" tabIndex={-1} className="k-main">{body}</main>
      <NewBadgeToast />
      <nav className="k-tabbar" aria-label="Kids sections">
        {KTABS.map((t) => (
          <a key={t.path} href={href(t.path)} className={tabOn(t.path) ? "on" : ""} aria-current={tabOn(t.path) ? "page" : undefined} onClick={(e) => { e.preventDefault(); navigate(t.path); }}>
            <span aria-hidden>{t.icon}</span><span>{t.label}</span>
          </a>
        ))}
      </nav>
      {gate && <ParentGate onPass={() => { setGate(false); navigate("/kids/grownups"); }} onClose={() => setGate(false)} />}
    </div>
  );
}
