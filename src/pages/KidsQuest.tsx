// Metaphases Kids — learn by doing. A 9-year-old doesn't know what a company, a share or a price is,
// so before any real ticker we let them RUN one: Luna's Lemonade Stand (sell cups → profit, slice the
// stand → shares, tap buyers/sellers → price, open its report card → beat/miss). Every tricky word on a
// card is also a tappable picture card (<W>, <WordChips>) that can jump straight into the matching stage.
// All copy lives in shared/kidsContent.ts so a unit test keeps it at reading grade ≤ 5.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KID_TERMS, QUEST, type KidTermKey, type QuestPlay, type QuestStage } from "../../shared/kidsContent";
import { KID_BY_SYMBOL } from "../../shared/kids";
import {
  CH_STAGES, CHAPTERS, chaptersDone, DIV, DIV_CARDS, DIV_CHECK, jarPath, nextChapter, SAVE, SAVE_CHECK, SEASONS, snowball, SORT_ITEMS, TREE_YEARS, treePath,
  type ChapterId, type CheckQ,
} from "../../shared/kidsQuestContent";

/** "company" → /kids/start?step=company; "save:jar" → /kids/start?chapter=save&step=jar. */
const playHref = (p: QuestPlay) => {
  const [c, s] = p.includes(":") ? p.split(":") : ["", p];
  return c ? `/kids/start?chapter=${c}&step=${s}` : `/kids/start?step=${s}`;
};
import { useDialog } from "../lib/dialog";
import { kids, useKids } from "../lib/kidsStore";
import { navigate } from "../lib/router";
import { Luna, MoonPhase, ReadAloud } from "./Kids";

// ── Tap-a-word ──────────────────────────────────────────────────────────────────────────────
function WordCard({ k, onClose }: { k: KidTermKey; onClose: () => void }) {
  const t = KID_TERMS[k];
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const play = "play" in t ? playHref(t.play as QuestPlay) : undefined;
  return (
    <div className="drawer-scrim center" onClick={(e) => { e.stopPropagation(); onClose(); }} onTouchEnd={(e) => e.stopPropagation()}>
      <div className="k-wordcard" ref={ref} role="dialog" aria-modal="true" aria-labelledby="k-wordcard-t" onClick={(e) => e.stopPropagation()}>
        <span className="k-wordcard-emoji" aria-hidden>{t.emoji}</span>
        <h2 id="k-wordcard-t">{t.word}</h2>
        <p className="k-line">{t.means}</p>
        <p className="k-example">{t.example}</p>
        <div className="k-nav">
          <ReadAloud text={`${t.word}. ${t.means} ${t.example}`} />
          {play && <button className="k-btn" onClick={() => { onClose(); navigate(play); }}>Play it 🍋</button>}
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

// ── Chapter navigation ──────────────────────────────────────────────────────────────────────
const chapterHref = (id: ChapterId) => `/kids/start?chapter=${id}`;

function ChapterNav({ on }: { on: ChapterId }) {
  const st = useKids();
  const done = chaptersDone(st.quest, st.questDone);
  return (
    <nav className="k-chapnav" aria-label="Quest chapters">
      {CHAPTERS.map((c, i) => (
        <button key={c.id} className={`${c.id === on ? "on" : ""}${done.includes(c.id) ? " done" : ""}`} aria-current={c.id === on ? "page" : undefined} onClick={() => navigate(chapterHref(c.id))}>
          <span aria-hidden>{done.includes(c.id) ? "✅" : c.emoji}</span><small>Chapter {i + 1}</small>
        </button>
      ))}
    </nav>
  );
}

function ChapterPicker() {
  const st = useKids();
  const done = chaptersDone(st.quest, st.questDone);
  const next = nextChapter(done);
  return (
    <div className="k-page k-quest">
      <header className="k-hero">
        <Luna size={64} wave />
        <div><span className="k-eyebrow">{done.length} of {CHAPTERS.length} chapters done</span><h1>Luna's <em>Quests</em></h1></div>
      </header>
      <p className="k-intro">Learn by playing. Each chapter is a few small steps. Tap one to start!</p>
      <ul className="k-chapters">
        {CHAPTERS.map((c, i) => {
          const isDone = done.includes(c.id);
          return (
            <li key={c.id}>
              <button className={`k-chapter${isDone ? " done" : ""}${next?.id === c.id ? " next" : ""}`} onClick={() => navigate(chapterHref(c.id))}>
                <span className="k-chapter-emoji" aria-hidden>{c.emoji}</span>
                <span className="k-chapter-t">
                  <span className="k-eyebrow">Chapter {i + 1}{isDone ? " · done ✅" : next?.id === c.id ? " · up next" : ""}</span>
                  <b>{c.title}</b>
                  <small>{c.blurb}</small>
                </span>
                <span className="k-starthere-go" aria-hidden>→</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Pieces every micro-lesson uses ──────────────────────────────────────────────────────────
function Remember({ text }: { text: string }) {
  return <p className="k-remember"><b>💡 Remember:</b> {text}</p>;
}
function NextBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="k-btn k-btn-primary k-wide" onClick={onClick}>{label}</button>;
}
const money = (v: number) => `$${v.toFixed(2)}`;

function CheckStage({ qs, done, onDone, last }: { qs: CheckQ[]; done: string; onDone: () => void; last: string }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const all = qs.every((_, i) => picked[i] != null);
  const right = qs.filter((q, i) => picked[i] === q.answer).length;
  return (
    <>
      <Speech text={all ? `${done} You got ${right} of ${qs.length} right.` : "Two quick questions. Tap an answer!"} />
      {qs.map((q, qi) => (
        <div key={q.q} className="k-check">
          <b className="k-q-sm">{qi + 1}. {q.q}</b>
          <div className="k-answers">
            {q.options.map((o, i) => (
              <button key={o} className={`k-answer${picked[qi] === i ? (i === q.answer ? " right" : " wrong") : ""}`} aria-pressed={picked[qi] === i} onClick={() => setPicked({ ...picked, [qi]: i })}>{o}</button>
            ))}
          </div>
          {picked[qi] != null && <p className="k-feedback" role="status">{picked[qi] === q.answer ? "🎉 Yes! " : "Good try! "}{q.why}</p>}
        </div>
      ))}
      {all && <NextBtn label={last} onClick={onDone} />}
    </>
  );
}

// ── Chapter 2: Save or Grow? ────────────────────────────────────────────────────────────────
const JAR_YEARS = 5;
function JarStage({ onDone, next }: { onDone: () => void; next: string }) {
  const [y, setY] = useState(0);
  const path = jarPath(JAR_YEARS);
  const done = y >= JAR_YEARS;
  const earned = path[y] - path[0];
  return (
    <>
      <Speech text={done ? SAVE.jar.done : SAVE.jar.ask} />
      <div className="k-jarbox">
        <div className="k-jar" aria-live="polite" aria-label={`Savings jar: ${money(path[y])} after ${y} ${y === 1 ? "year" : "years"}`}>
          <span className="k-jar-emoji" aria-hidden>🫙</span>
          <b>{money(path[y])}</b>
          <small>Year {y} of {JAR_YEARS}</small>
          {y > 0 && <i key={y} className="k-pop" aria-hidden>+{Math.round((path[y] - path[y - 1]) * 100)}¢</i>}
        </div>
        <button className="k-btn k-btn-primary" onClick={() => setY(Math.min(JAR_YEARS, y + 1))} disabled={done}>⏳ {SAVE.jar.tap}</button>
      </div>
      <dl className="k-ledger">
        <div><dt>🫙 You put in</dt><dd>{money(path[0])}</dd></div>
        <div><dt>➕ <W k="interest">Interest</W> so far</dt><dd>+{money(earned)}</dd></div>
        <div className="k-ledger-profit"><dt>💰 In the jar now</dt><dd>{money(path[y])}</dd></div>
      </dl>
      {done && <><Remember text={SAVE.jar.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}

function TreeStage({ onDone, next }: { onDone: () => void; next: string }) {
  const years = TREE_YEARS.length;
  const [y, setY] = useState(0);
  const tree = treePath(years), jar = jarPath(years);
  const done = y >= years;
  const w = 280, h = 130, lo = 8, hi = 20;
  const X = (i: number) => (i / years) * w;
  const Y = (v: number) => h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * h;
  const line = (p: number[]) => p.slice(0, y + 1).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const last = y > 0 ? TREE_YEARS[y - 1] : null;
  const say = done ? SAVE.tree.done : last == null ? SAVE.tree.ask : last < 0 ? `${SAVE.tree.downYear} (${last}%)` : `${SAVE.tree.upYear} (+${last}%)`;
  const scale = 0.8 + Math.min(1.2, (tree[y] - lo) / (hi - lo));
  return (
    <>
      <Speech text={say} />
      <div className="k-grow">
        <div className="k-grow-tags" aria-live="polite">
          <span className="k-tag jar">🫙 Jar <b>{money(jar[y])}</b></span>
          <span className={`k-tag tree${last != null && last < 0 ? " down" : ""}`}>🌳 Tree <b>{money(tree[y])}</b></span>
        </div>
        <div className="k-grow-row">
          <span className="k-tree" aria-hidden style={{ fontSize: `${(40 * scale).toFixed(0)}px` }}>{last != null && last < 0 ? "🍂" : "🌳"}</span>
          <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="k-price-line k-grow-chart" role="img" aria-label={`After ${y} years: the jar has ${money(jar[y])}, the tree has ${money(tree[y])}.`}>
            <line x1="0" x2={w} y1={Y(START_LINE)} y2={Y(START_LINE)} className="goal" />
            {y > 0 && <polyline points={line(jar)} className="jar" />}
            {y > 0 && <polyline points={line(tree)} />}
          </svg>
        </div>
        <span className="k-small k-center">Year {y} of {years}</span>
        <button className="k-btn k-btn-primary" onClick={() => setY(Math.min(years, y + 1))} disabled={done}>⏳ {SAVE.tree.tap}</button>
      </div>
      {done && <><Remember text={SAVE.tree.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}
const START_LINE = 10;

function ChooseStage({ onDone, next }: { onDone: () => void; next: string }) {
  const [picks, setPicks] = useState<Record<string, "save" | "invest">>({});
  const sorted = SORT_ITEMS.filter((it) => picks[it.id] === it.answer);
  const done = sorted.length === SORT_ITEMS.length;
  return (
    <>
      <Speech text={done ? SAVE.choose.done : SAVE.choose.ask} />
      <div className="k-buckets" aria-live="polite">
        <span>🫙 Jar: <b>{sorted.filter((it) => it.answer === "save").length}</b></span>
        <span>🌳 Tree: <b>{sorted.filter((it) => it.answer === "invest").length}</b></span>
      </div>
      <ul className="k-sort">
        {SORT_ITEMS.map((it) => {
          const p = picks[it.id];
          const ok = p === it.answer;
          return (
            <li key={it.id} className={p ? (ok ? "right" : "wrong") : ""}>
              <div className="k-sort-head"><span aria-hidden>{it.emoji}</span><b>{it.text}</b></div>
              {!ok && (
                <div className="k-pick">
                  <button className="k-big k-save" onClick={() => setPicks({ ...picks, [it.id]: "save" })} aria-label={`${it.text}: save in the jar`}>🫙 Jar</button>
                  <button className="k-big k-invest" onClick={() => setPicks({ ...picks, [it.id]: "invest" })} aria-label={`${it.text}: grow a tree`}>🌳 Tree</button>
                </div>
              )}
              {p && <p className="k-feedback" role="status">{ok ? `✅ ${it.answer === "save" ? "Jar" : "Tree"}! ` : "🤔 Try the other one. "}{ok ? it.why : ""}</p>}
            </li>
          );
        })}
      </ul>
      {done && <><Remember text={SAVE.choose.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}

// ── Chapter 3: Your Slice Pays You ──────────────────────────────────────────────────────────
const OWNERS = [{ e: "😀", n: "You" }, { e: "🐻", n: "Bear" }, { e: "🐰", n: "Bunny" }, { e: "🐸", n: "Frog" }];
function PayoutStage({ onDone, next }: { onDone: () => void; next: string }) {
  const [paid, setPaid] = useState<number[]>([]);
  const done = paid.length === OWNERS.length;
  const left = OWNERS.length - paid.length;
  return (
    <>
      <Speech text={done ? DIV.payout.done : DIV.payout.ask} />
      <div className="k-pot">
        <div className="k-pot-box"><span className="k-small">🌱 Kept to grow the stand</span><b>$4</b></div>
        <div className="k-pot-box share" aria-live="polite"><span className="k-small">🪙 Left to share</span><b>${left}</b><span className="k-coins" aria-hidden>{"🪙".repeat(left) || "✨"}</span></div>
      </div>
      <div className="k-owners">
        {OWNERS.map((o, i) => {
          const got = paid.includes(i);
          return (
            <button key={o.n} className={`k-friend${got ? " got" : ""}`} onClick={() => !got && setPaid([...paid, i])} disabled={got} aria-label={`Give ${o.n} a $1 coin`}>
              <span aria-hidden>{o.e}</span><b>{o.n}</b><small>{got ? "got $1 🪙" : "1 slice"}</small>
            </button>
          );
        })}
      </div>
      {done && <><Remember text={DIV.payout.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}

function SnowballStage({ onDone, next }: { onDone: () => void; next: string }) {
  const [guess, setGuess] = useState<"spend" | "replant" | null>(null);
  const [n, setN] = useState(0);
  const sb = snowball(SEASONS);
  const done = n >= SEASONS;
  const sp = sb.spend[n], rp = sb.replant[n];
  const maxSlices = sb.replant[SEASONS].slices;
  return (
    <>
      <Speech text={done ? `${DIV.snowball.done} ${guess === "replant" ? "You guessed right!" : "Now you know!"}` : DIV.snowball.ask} />
      {!guess ? (
        <div className="k-pick">
          <button className="k-big k-save" onClick={() => setGuess("spend")}>🍦 Spend it</button>
          <button className="k-big k-invest" onClick={() => setGuess("replant")}>🌱 Replant it</button>
        </div>
      ) : (
        <>
          <div className="k-snow" aria-live="polite">
            <div className="k-snow-col">
              <b>🍦 Spend it</b>
              <div className="k-bar"><i style={{ width: `${(sp.slices / maxSlices) * 100}%` }} /></div>
              <span><b>{sp.slices}</b> slices</span>
              <span className="k-small">Spent on treats: {money(sp.spent)}</span>
              <span className="k-small">Pays {money(sp.pay)} next season</span>
            </div>
            <div className="k-snow-col replant">
              <b>🌱 Replant it</b>
              <div className="k-bar"><i style={{ width: `${(rp.slices / maxSlices) * 100}%` }} /></div>
              <span><b>{rp.slices.toFixed(1)}</b> slices</span>
              <span className="k-small">Spent on treats: $0.00</span>
              <span className="k-small">Pays {money(rp.pay)} next season</span>
            </div>
          </div>
          <span className="k-small k-center">Season {n} of {SEASONS} · your guess: {guess === "spend" ? "🍦 spend" : "🌱 replant"}</span>
          <button className="k-btn k-btn-primary" onClick={() => setN(Math.min(SEASONS, n + 1))} disabled={done}>⛅ {DIV.snowball.tap}</button>
        </>
      )}
      {done && <><Remember text={DIV.snowball.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}

function RealStage({ onDone, next }: { onDone: () => void; next: string }) {
  const [ans, setAns] = useState<Record<string, boolean>>({});
  const done = DIV_CARDS.every((c) => c.s in ans);
  const right = DIV_CARDS.filter((c) => ans[c.s] === c.pays).length;
  return (
    <>
      <Speech text={done ? `${DIV.real.done} You got ${right} of ${DIV_CARDS.length} right.` : DIV.real.ask} />
      <ul className="k-flips">
        {DIV_CARDS.map((c) => {
          const co = KID_BY_SYMBOL[c.s];
          const a = ans[c.s];
          const flipped = a != null;
          return (
            <li key={c.s} className={`k-flip${flipped ? " flipped" : ""}${flipped ? (a === c.pays ? " right" : " wrong") : ""}`}>
              <div className="k-sort-head"><span aria-hidden>{co.emoji}</span><b>{co.nick}</b></div>
              {!flipped ? (
                <>
                  <span className="k-small">Pays a dividend?</span>
                  <div className="k-pick">
                    <button className="k-big k-save" onClick={() => setAns({ ...ans, [c.s]: true })} aria-label={`${co.nick}: yes, pays a dividend`}>Yes 🪙</button>
                    <button className="k-big k-invest" onClick={() => setAns({ ...ans, [c.s]: false })} aria-label={`${co.nick}: no dividend`}>No 🌱</button>
                  </div>
                </>
              ) : (
                <p className="k-flip-back" role="status">{a === c.pays ? "✅" : "🤔"} <b>{c.pays ? "Yes!" : "No."}</b> {co.nick} {c.pays ? DIV.real.yes : DIV.real.no}</p>
              )}
            </li>
          );
        })}
      </ul>
      {done && <><Remember text={DIV.real.remember} /><NextBtn label={next} onClick={onDone} /></>}
    </>
  );
}

// ── A chapter (2 or 3): micro-lessons in order, each saved as "<chapter>:<stage>" ───────────
const STAGE_META: Record<string, { icon: string; title: string }> = {
  "save:jar": { icon: "🫙", title: SAVE.jar.title }, "save:tree": { icon: "🌳", title: SAVE.tree.title },
  "save:choose": { icon: "🤔", title: SAVE.choose.title }, "save:check": { icon: "✅", title: SAVE.check.title },
  "dividends:payout": { icon: "🪙", title: DIV.payout.title }, "dividends:snowball": { icon: "⛄", title: DIV.snowball.title },
  "dividends:real": { icon: "🏢", title: DIV.real.title }, "dividends:check": { icon: "✅", title: DIV.check.title },
};

function Chapter({ id, want }: { id: "save" | "dividends"; want: string | null }) {
  const st = useKids();
  const stages = CH_STAGES[id] as readonly string[];
  const meta = CHAPTERS.find((c) => c.id === id)!;
  const text = id === "save" ? SAVE : DIV;
  const has = (s: string) => st.quest.includes(`${id}:${s}`);
  const firstOpen = stages.find((s) => !has(s));
  const [stage, setStage] = useState<string>(want && stages.includes(want) ? want : firstOpen && stages.some(has) ? firstOpen : "intro");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [stage]);
  const idx = stage === "intro" ? -1 : stage === "done" ? stages.length : stages.indexOf(stage);
  const nextOf = (s: string) => stages[stages.indexOf(s) + 1];
  const nextLabel = (s: string) => { const nx = nextOf(s); return nx ? `Next: ${STAGE_META[`${id}:${nx}`].title} ${STAGE_META[`${id}:${nx}`].icon}` : "Finish the chapter 🏆"; };
  const finish = (s: string) => { kids.questStage(`${id}:${s}`); setStage(nextOf(s) ?? "done"); };
  const done = chaptersDone(st.quest, st.questDone);
  const after = nextChapter(done);
  const props = (s: string) => ({ onDone: () => finish(s), next: nextLabel(s) });
  return (
    <div className="k-page k-quest">
      <header className="k-hero">
        <span className="k-hero-emoji" aria-hidden>{meta.emoji}</span>
        <div><span className="k-eyebrow">Chapter {CHAPTERS.indexOf(meta) + 1} · learn by doing</span><h1>{meta.title}</h1></div>
      </header>
      <ChapterNav on={id} />
      <ol className="k-quest-steps" aria-label="Chapter steps">
        {stages.map((s, i) => (
          <li key={s} className={i < idx || has(s) ? "done" : i === idx ? "on" : ""}>
            <button onClick={() => setStage(s)} aria-current={i === idx ? "step" : undefined}><span aria-hidden>{STAGE_META[`${id}:${s}`].icon}</span>{STAGE_META[`${id}:${s}`].title}</button>
          </li>
        ))}
      </ol>
      <article className="k-story k-quest-card">
        {stage === "intro" && (
          <>
            <Speech text={text.intro} />
            <NextBtn label={`Let's go! ${meta.emoji}`} onClick={() => setStage(stages[0])} />
          </>
        )}
        {id === "save" && stage === "jar" && <JarStage {...props("jar")} />}
        {id === "save" && stage === "tree" && <TreeStage {...props("tree")} />}
        {id === "save" && stage === "choose" && <ChooseStage {...props("choose")} />}
        {id === "save" && stage === "check" && <CheckStage qs={SAVE_CHECK} done={SAVE.check.done} onDone={() => finish("check")} last={nextLabel("check")} />}
        {id === "dividends" && stage === "payout" && <PayoutStage {...props("payout")} />}
        {id === "dividends" && stage === "snowball" && <SnowballStage {...props("snowball")} />}
        {id === "dividends" && stage === "real" && <RealStage {...props("real")} />}
        {id === "dividends" && stage === "check" && <CheckStage qs={DIV_CHECK} done={DIV.check.done} onDone={() => finish("check")} last={nextLabel("check")} />}
        {stage === "done" && (
          <div className="k-celebrate" role="status">
            <MoonPhase phase={3} size={96} />
            <h2>{id === "save" ? "Smart Saver!" : "Dividend Detective!"} 🏆</h2>
            <p className="k-line">{text.finish}</p>
            <ReadAloud text={text.finish} />
            <div className="k-adventures">
              {after && <button className="k-adv" onClick={() => navigate(chapterHref(after.id))}><span aria-hidden>{after.emoji}</span><b>Next chapter: {after.title}</b><small>{after.blurb}</small></button>}
              <button className="k-adv" onClick={() => navigate("/kids/piggy")}><span aria-hidden>🐷</span><b>Pretend Piggy Bank</b><small>Try it with pretend coins</small></button>
              <button className="k-adv" onClick={() => navigate("/kids/start")}><span aria-hidden>🗺️</span><b>All chapters</b><small>See your quests</small></button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

// ── Chapter 1: Luna's Lemonade Stand (unchanged flow) ───────────────────────────────────────
function LemonadeChapter() {
  const st = useKids();
  const want = new URLSearchParams(location.search).get("step") as QuestStage | null;
  const firstOpen = STAGES.find((s) => !st.quest.includes(s)) ?? "company";
  const lemonStarted = STAGES.some((s) => st.quest.includes(s));
  const [stage, setStage] = useState<QuestStage | "intro" | "done">(want && STAGES.includes(want) ? want : st.questDone ? "intro" : lemonStarted ? firstOpen : "intro");
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
      <ChapterNav on="lemonade" />
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
              <button className="k-adv" onClick={() => navigate(chapterHref("save"))}><span aria-hidden>🌳</span><b>Next chapter: Save or Grow?</b><small>A savings jar or a money tree?</small></button>
              <button className="k-adv" onClick={() => navigate("/kids/guess")}><span aria-hidden>🎯</span><b>Guess a real report card</b><small>Disney, Apple, Nike…</small></button>
              <button className="k-adv" onClick={() => navigate("/kids/piggy")}><span aria-hidden>🐷</span><b>Pretend Piggy Bank</b><small>Own pretend shares</small></button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

/** /kids/start: a new kid goes straight into Chapter 1; after that, the chapter picker. */
export function QuestPage() {
  const st = useKids();
  // Decide once per visit (the page is keyed by the URL): finishing Chapter 1 must not swap the
  // celebration out for the picker mid-screen.
  const [view] = useState(() => {
    const q = new URLSearchParams(location.search);
    const ch = q.get("chapter"), step = q.get("step");
    if (ch === "save" || ch === "dividends") return { kind: ch, step } as const;
    if (ch === "lemonade" || step || !chaptersDone(st.quest, st.questDone).includes("lemonade")) return { kind: "lemonade", step } as const;
    return { kind: "picker", step: null } as const;
  });
  if (view.kind === "save" || view.kind === "dividends") return <Chapter id={view.kind} want={view.step} />;
  if (view.kind === "lemonade") return <LemonadeChapter />;
  return <ChapterPicker />;
}

/** The "Start here" banner on Story and Moon School: Chapter 1 first, then the next unfinished chapter. */
export function StartHere() {
  const st = useKids();
  const next = nextChapter(chaptersDone(st.quest, st.questDone));
  if (!next) return null;
  if (next.id === "lemonade") {
    const n = STAGES.filter((s) => st.quest.includes(s)).length;
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
  const stages = CH_STAGES[next.id] as readonly string[];
  const n = stages.filter((s) => st.quest.includes(`${next.id}:${s}`)).length;
  return (
    <button className="k-starthere" onClick={() => navigate(chapterHref(next.id))}>
      <span className="k-starthere-emoji" aria-hidden>{next.emoji}</span>
      <span className="k-starthere-t">
        <span className="k-eyebrow">{n ? `Keep going · ${n} of ${stages.length} done` : `Chapter ${CHAPTERS.indexOf(next) + 1} is ready`}</span>
        <b>Next chapter: {next.title}</b>
        <small>{next.blurb}</small>
      </span>
      <span className="k-starthere-go" aria-hidden>→</span>
    </button>
  );
}
