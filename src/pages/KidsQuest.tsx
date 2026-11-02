// Metaphases Kids — learn by doing. A 9-year-old doesn't know what a company, a share or a price is,
// so before any real ticker we let them RUN one: Luna's Lemonade Stand (sell cups → profit, slice the
// stand → shares, tap buyers/sellers → price, open its report card → beat/miss). Every tricky word on a
// card is also a tappable picture card (<W>, <WordChips>) that can jump straight into the matching stage.
// All copy lives in shared/kidsContent.ts so a unit test keeps it at reading grade ≤ 5.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KID_TERMS, QUEST, type KidTermKey, type QuestStage } from "../../shared/kidsContent";
import { useDialog } from "../lib/dialog";
import { kids, useKids } from "../lib/kidsStore";
import { navigate } from "../lib/router";
import { Luna, MoonPhase, ReadAloud } from "./Kids";

// ── Tap-a-word ──────────────────────────────────────────────────────────────────────────────
function WordCard({ k, onClose }: { k: KidTermKey; onClose: () => void }) {
  const t = KID_TERMS[k];
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const play = "play" in t ? (t.play as QuestStage) : undefined;
  return (
    <div className="drawer-scrim center" onClick={(e) => { e.stopPropagation(); onClose(); }} onTouchEnd={(e) => e.stopPropagation()}>
      <div className="k-wordcard" ref={ref} role="dialog" aria-modal="true" aria-labelledby="k-wordcard-t" onClick={(e) => e.stopPropagation()}>
        <span className="k-wordcard-emoji" aria-hidden>{t.emoji}</span>
        <h2 id="k-wordcard-t">{t.word}</h2>
        <p className="k-line">{t.means}</p>
        <p className="k-example">{t.example}</p>
        <div className="k-nav">
          <ReadAloud text={`${t.word}. ${t.means} ${t.example}`} />
          {play && <button className="k-btn" onClick={() => { onClose(); navigate(`/kids/start?step=${play}`); }}>Play it 🍋</button>}
          <button className="k-btn k-btn-primary" onClick={onClose}>Got it!</button>
        </div>
      </div>
    </div>
  );
}

/** An inline word a kid can tap to see what it means. */
export function W({ k, children }: { k: KidTermKey; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="k-w" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={`${KID_TERMS[k].word}: what does it mean?`}>{children ?? KID_TERMS[k].word.toLowerCase()}</button>
      {open && <WordCard k={k} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Words on this card" — a row of ❓ chips at the bottom of a story card. */
export function WordChips({ ks }: { ks: KidTermKey[] }) {
  const [open, setOpen] = useState<KidTermKey | null>(null);
  return (
    <div className="k-wordchips" onClick={(e) => e.stopPropagation()}>
      <span className="k-small">What's that word?</span>
      {ks.map((k) => (
        <button key={k} className="k-wordchip" onClick={() => setOpen(k)} aria-label={`${KID_TERMS[k].word}: what does it mean?`}>
          <span aria-hidden>{KID_TERMS[k].emoji}</span> {KID_TERMS[k].word} <b aria-hidden>?</b>
        </button>
      ))}
      {open && <WordCard k={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Luna's Lemonade Stand ───────────────────────────────────────────────────────────────────
const STAGES: QuestStage[] = ["company", "shares", "price", "report"];
const STAGE_ICON: Record<QuestStage, string> = { company: "🍋", shares: "🍕", price: "🏷️", report: "📝" };

function Speech({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="k-speech">
      <Luna size={52} />
      <div className="k-speech-bubble">
        <p>{text}</p>
        {children}
        <ReadAloud text={text} />
      </div>
    </div>
  );
}

function CompanyStage({ onDone }: { onDone: () => void }) {
  const [cups, setCups] = useState(0);
  const [pops, setPops] = useState<number[]>([]);
  const goal = 10;
  const money = cups, lemons = Math.round(cups * 0.4 * 100) / 100, profit = money - lemons;
  const sell = () => {
    if (cups >= goal) return;
    setCups(cups + 1);
    const id = Date.now() + Math.random();
    setPops([id]); // one floater at a time, restarted per tap (stacked ones smudge)
  };
  const done = cups >= goal;
  return (
    <>
      <Speech text={done ? QUEST.company.done : QUEST.company.ask} />
      <div className="k-stand">
        <button className="k-cup" onClick={sell} disabled={done} aria-label={`Sell a cup of lemonade. ${cups} of ${goal} sold`}>
          <span className="k-cup-emoji" aria-hidden>🥤</span>
          <span className="k-cup-label">{done ? "Sold out!" : "Sell a cup"}</span>
          {pops.map((id) => <i key={id} className="k-pop" aria-hidden>+$1</i>)}
        </button>
        <div className="k-cups" aria-hidden>{Array.from({ length: goal }, (_, i) => <span key={i} className={i < cups ? "on" : ""}>🍋</span>)}</div>
      </div>
      <dl className="k-ledger" aria-live="polite">
        <div><dt>💵 Money in</dt><dd>${money.toFixed(2)}</dd></div>
        <div><dt>🍋 Lemons cost</dt><dd>−${lemons.toFixed(2)}</dd></div>
        <div className="k-ledger-profit"><dt>✨ Profit</dt><dd>${profit.toFixed(2)}</dd></div>
      </dl>
      {done && <button className="k-btn k-btn-primary k-wide" onClick={onDone}>Next: cut it into shares 🍕</button>}
    </>
  );
}

const FRIENDS = [{ e: "🐻", n: "Bear" }, { e: "🐰", n: "Bunny" }, { e: "🐸", n: "Frog" }];
const SLICE_COLORS = ["#ffd84d", "#ffb547", "#ffe98a", "#ffc970"];
function slicePath(i: number) {
  const r = 80, c = 90, a0 = (i * Math.PI) / 2 - Math.PI / 2, a1 = a0 + Math.PI / 2;
  return `M${c} ${c}L${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}Z`;
}
function SharesStage({ onDone }: { onDone: () => void }) {
  const [owners, setOwners] = useState<(number | null)[]>([null, null, null, null]);
  const sold = owners.filter((o) => o != null).length;
  const done = sold >= 3;
  const give = (f: number) => {
    if (owners.includes(f)) return;
    const i = owners.findIndex((o, k) => o == null && k > 0); // slice 0 is always yours
    if (i < 0) return;
    setOwners(owners.map((o, k) => (k === i ? f : o)));
  };
  return (
    <>
      <Speech text={done ? QUEST.shares.done : QUEST.shares.ask} />
      <div className="k-slices">
        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={`Your stand, cut into 4 shares. You own ${4 - sold}, friends own ${sold}.`}>
          {owners.map((o, i) => (
            <g key={i} className={`k-slice${o != null ? " sold" : ""}`}>
              <path d={slicePath(i)} fill={SLICE_COLORS[i]} stroke="var(--k-ink)" strokeWidth="3" />
              <text x={90 + 42 * Math.cos((i * Math.PI) / 2 - Math.PI / 4)} y={90 + 42 * Math.sin((i * Math.PI) / 2 - Math.PI / 4) + 9} textAnchor="middle" fontSize="26">{o != null ? FRIENDS[o].e : i === 0 ? "😀" : "🍋"}</text>
            </g>
          ))}
        </svg>
        <div className="k-friends">
          {FRIENDS.map((f, i) => (
            <button key={f.n} className={`k-friend${owners.includes(i) ? " got" : ""}`} onClick={() => give(i)} disabled={owners.includes(i)} aria-label={`Sell ${f.n} a share for $5`}>
              <span aria-hidden>{f.e}</span><b>{f.n}</b><small>{owners.includes(i) ? "owns a share!" : "pays $5"}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="k-small k-center" aria-live="polite">You own <b>{4 - sold}</b> of 4 shares · you got <b>${sold * 5}</b></p>
      {done && <button className="k-btn k-btn-primary k-wide" onClick={onDone}>Next: watch the price 🏷️</button>}
    </>
  );
}

function PriceStage({ onDone }: { onDone: () => void }) {
  const [hist, setHist] = useState<number[]>([5]);
  const [hitUp, setHitUp] = useState(false);
  const [hitDown, setHitDown] = useState(false);
  const price = hist[hist.length - 1];
  const move = (d: number) => {
    const next = Math.max(1, Math.min(12, price + d));
    setHist((h) => [...h.slice(-19), next]);
    if (next >= 8) setHitUp(true);
    if (hitUp && next <= 4) setHitDown(true);
  };
  const done = hitUp && hitDown;
  const w = 260, h = 90, max = 12;
  const pts = hist.map((v, i) => `${(i / Math.max(1, hist.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  const last = hist.length > 1 ? price - hist[hist.length - 2] : 0;
  return (
    <>
      <Speech text={done ? QUEST.price.done : QUEST.price.ask} />
      <div className="k-market">
        <div className={`k-price${last > 0 ? " up" : last < 0 ? " down" : ""}`} aria-live="polite" key={hist.length}>
          <small>Price of 1 share</small><b>${price}</b>
        </div>
        <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} className="k-price-line" aria-hidden>
          <line x1="0" x2={w} y1={h - (8 / max) * h} y2={h - (8 / max) * h} className="goal" />
          <line x1="0" x2={w} y1={h - (4 / max) * h} y2={h - (4 / max) * h} className="goal" />
          <polyline points={hist.length > 1 ? pts : `0,${h - (5 / max) * h} ${w},${h - (5 / max) * h}`} />
        </svg>
        <div className="k-pick">
          <button className="k-big k-beat" onClick={() => move(1)} aria-label="A buyer wants it: price up">🙋 Buyer</button>
          <button className="k-big k-miss" onClick={() => move(-1)} aria-label="A seller wants out: price down">🙅 Seller</button>
        </div>
        <p className="k-small k-center">🙋 A buyer wants a share. 🙅 A seller wants to get rid of one.</p>
        <ul className="k-goals">
          <li className={hitUp ? "done" : ""}>{hitUp ? "✅" : "⬜"} {QUEST.price.up}</li>
          <li className={hitDown ? "done" : ""}>{hitDown ? "✅" : "⬜"} {QUEST.price.down}</li>
        </ul>
      </div>
      {done && <button className="k-btn k-btn-primary k-wide" onClick={onDone}>Next: report card day 📝</button>}
    </>
  );
}

function ReportStage({ onDone }: { onDone: () => void }) {
  const [pick, setPick] = useState<"beat" | "miss" | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Speech text={open ? `${QUEST.report.result} ${QUEST.report.done}` : QUEST.report.ask} />
      <div className="k-envelope-wrap">
        <div className="k-guessbar"><span>🔮 Grown-ups' guess</span><b>$6</b></div>
        {!pick && (
          <div className="k-pick">
            <button className="k-big k-beat" onClick={() => setPick("beat")}>Beat 👍</button>
            <button className="k-big k-miss" onClick={() => setPick("miss")}>Miss 👎</button>
          </div>
        )}
        {pick && !open && <button className="k-envelope" onClick={() => setOpen(true)}><span aria-hidden>✉️</span>{QUEST.report.reveal}</button>}
        {open && (
          <div className="k-reportcard" role="status">
            <span className="k-eyebrow">Lemonade Stand · report card</span>
            <div className="k-guessbar"><span>✨ Real profit</span><b>$7</b></div>
            <b className="k-result-title">BEAT! {pick === "beat" ? "🎉 You guessed right!" : "🌧️ Not this time, but now you know!"}</b>
          </div>
        )}
      </div>
      {open && <button className="k-btn k-btn-primary k-wide" onClick={onDone}>Finish the quest 🏆</button>}
    </>
  );
}

export function QuestPage() {
  const st = useKids();
  const want = new URLSearchParams(location.search).get("step") as QuestStage | null;
  const firstOpen = STAGES.find((s) => !st.quest.includes(s)) ?? "company";
  const [stage, setStage] = useState<QuestStage | "intro" | "done">(want && STAGES.includes(want) ? want : st.questDone ? "intro" : st.quest.length ? firstOpen : "intro");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [stage]);
  const finish = (s: QuestStage) => {
    kids.questStage(s);
    const next = STAGES[STAGES.indexOf(s) + 1];
    if (next) setStage(next);
    else { kids.finishQuest(); setStage("done"); }
  };
  const idx = stage === "intro" ? -1 : stage === "done" ? STAGES.length : STAGES.indexOf(stage);
  return (
    <div className="k-page k-quest">
      <header className="k-hero">
        <span className="k-hero-emoji" aria-hidden>🍋</span>
        <div><span className="k-eyebrow">Start here · learn by doing</span><h1>Luna's <em>Lemonade Stand</em></h1></div>
      </header>
      <ol className="k-quest-steps" aria-label="Quest steps">
        {STAGES.map((s, i) => (
          <li key={s} className={i < idx || st.quest.includes(s) ? "done" : i === idx ? "on" : ""}>
            <button onClick={() => setStage(s)} aria-current={i === idx ? "step" : undefined}><span aria-hidden>{STAGE_ICON[s]}</span>{QUEST[s].title}</button>
          </li>
        ))}
      </ol>
      <article className="k-story k-quest-card">
        {stage === "intro" && (
          <>
            <Speech text={QUEST.intro} />
            <button className="k-btn k-btn-primary k-wide" onClick={() => setStage("company")}>Let's go! 🍋</button>
          </>
        )}
        {stage === "company" && <CompanyStage onDone={() => finish("company")} />}
        {stage === "shares" && <SharesStage onDone={() => finish("shares")} />}
        {stage === "price" && <PriceStage onDone={() => finish("price")} />}
        {stage === "report" && <ReportStage onDone={() => finish("report")} />}
        {stage === "done" && (
          <div className="k-celebrate" role="status">
            <MoonPhase phase={2} size={96} />
            <h2>Lemonade Boss! 🏆</h2>
            <p className="k-line">{QUEST.finish}</p>
            <ReadAloud text={QUEST.finish} />
            <div className="k-adventures">
              <button className="k-adv" onClick={() => navigate("/kids/guess")}><span aria-hidden>🎯</span><b>Guess a real report card</b><small>Disney, Apple, Nike…</small></button>
              <button className="k-adv" onClick={() => navigate("/kids/piggy")}><span aria-hidden>🐷</span><b>Pretend Piggy Bank</b><small>Own pretend shares</small></button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

/** The "Start here" banner on Story and Moon School until the quest is done. */
export function StartHere() {
  const st = useKids();
  if (st.questDone) return null;
  const n = st.quest.length;
  return (
    <button className="k-starthere" onClick={() => navigate("/kids/start")}>
      <span className="k-starthere-emoji" aria-hidden>🍋</span>
      <span className="k-starthere-t">
        <span className="k-eyebrow">{n ? `Keep going · ${n} of 4 done` : "New here? Start here!"}</span>
        <b>Run Luna's Lemonade Stand</b>
        <small>Learn what a company, a share and a price are by playing.</small>
      </span>
      <span className="k-starthere-go" aria-hidden>→</span>
    </button>
  );
}
