// Today, in 60 seconds — story cards for the Everyday investor. Tap / swipe / arrow keys to move.
// Her names first (watchlist, holdings, funds), then the biggest reports; the market's mood; the big
// economic event; a way into Hype Check. Every card shares as a 9:16 image.
import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsEvent } from "../../shared/types";
import { InstallCoach, LensSwitch } from "../components/Everyday";
import { GradeBadge, Icon, Phase, Skeleton, Tile } from "../components/bits";
import { useCalendar, useMacro, useTicker } from "../lib/api";
import { curOf, heldVia, nameOf, UNIVERSE } from "../lib/data";
import { addDays, todayISO } from "../lib/dates";
import { epsIn, money } from "../lib/format";
import { moodPlain, movePlain, whatTheyDo, whenPlain } from "../lib/plain";
import { BASE, navigate, setParam } from "../lib/router";
import { useStore } from "../lib/store";
import { pickStories, type Story } from "../lib/stories";

/** Share a story card as a 9:16 image: native share sheet with the file when possible, else download. */
export async function shareStory(kind: string, title: string, text: string) {
  const url = `${BASE}/og/story/${kind}.png`;
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `metaphases-${kind.replace(/\W+/g, "-")}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
      await nav.share({ files: [file], title, text: `${text} ${location.origin}${BASE}/today` });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {}
}

function ReportCard({ s, today }: { s: Extract<Story, { kind: "report" }>; today: string }) {
  const { holdings } = useStore();
  const { data } = useTicker(s.e.s);
  const name = data?.profile?.name ?? nameOf(s.e.s);
  const via = heldVia(s.e.s, holdings);
  const direct = holdings.find((h) => h.s === s.e.s);
  const mine = (direct?.v ?? 0) + via.reduce((a, v) => a + v.dollars, 0);
  const why = { owned: "You own this", watch: "On your watchlist", fund: `Inside your ${s.via}`, big: "One of the week's biggest" }[s.why];
  return (
    <>
      <span className="st-why">{why}</span>
      <div className="st-co"><Tile s={s.e.s} size={64} force="logo" /><div><h2>{name}</h2><span className="eyebrow">{s.e.s}</span></div></div>
      <p className="st-does">{whatTheyDo(name, data?.profile?.industry ?? UNIVERSE[s.e.s]?.ind)}</p>
      <p className="st-when"><Phase h={s.e.h} size={26} /> Reports {whenPlain(s.e.d, s.e.h, today)}</p>
      <dl className="st-stats">
        <div><dt>Wall Street expects</dt><dd>{s.e.eE != null ? `${epsIn(s.e.eE, curOf(s.e.s))} a share` : "—"}</dd></div>
        <div><dt>How much it moves</dt><dd>{data ? (data.expectedMove != null ? `±${data.expectedMove.toFixed(1)}%` : "—") : <Skeleton w={70} h={22} />}</dd></div>
        <div><dt>Quality grade</dt><dd>{data ? <GradeBadge g={data.compass.grade} /> : <Skeleton w={40} h={22} />}</dd></div>
      </dl>
      {data && <p className="st-line">{movePlain(data.expectedMove)}</p>}
      {mine > 0 && <p className="st-mine">About <b>{money(mine)}</b> of your money rides on this report.</p>}
      <button className="st-more" onClick={(e) => { e.stopPropagation(); setParam("t", s.e.s); }}>The full read →</button>
    </>
  );
}

function storyShare(s: Story, today: string): { kind: string; title: string; text: string } | null {
  if (s.kind === "mood") return { kind: "mood", title: "The market's mood today", text: `${moodPlain(s.score).headline} — Market Mood ${s.score}/100.` };
  if (s.kind === "report") return { kind: `t/${s.e.s}`, title: `${s.e.s} reports ${whenPlain(s.e.d, s.e.h, today)}`, text: `${nameOf(s.e.s)} reports ${whenPlain(s.e.d, s.e.h, today)}.` };
  if (s.kind === "macro") return { kind: "week", title: s.m.name, text: `${s.m.name} ${whenPlain(s.m.date, "", today).replace(" (time not confirmed yet)", "")}.` };
  return null;
}

export default function TodayPage() {
  const { watch, holdings } = useStore();
  const today = todayISO();
  const from = today;
  const horizon = addDays(today, 9);
  const cal = useCalendar(from, horizon);
  const macro = useMacro();
  const [i, setI] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { document.title = "Today, in 60 seconds · Metaphases"; }, []);

  const stories = useMemo(() => {
    if (!cal.data && !macro.data) return [];
    return pickStories({
      events: (cal.data?.events ?? []) as EarningsEvent[], macro: macro.data, watch, holdings, today, horizon,
      mcap: (s) => UNIVERSE[s]?.mc ?? 0, heldVia,
    });
  }, [cal.data, macro.data, watch, holdings]);
  const n = stories.length;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[role=dialog]")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n]);

  const s = stories[Math.min(i, n - 1)];
  const sh = s ? storyShare(s, today) : null;
  const loading = (cal.loading || macro.loading) && !n;

  return (
    <div className="page today">
      <header className="today-head">
        <div>
          <span className="eyebrow">{new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <h1 className="headline">Today, <em>in 60 seconds</em>.</h1>
        </div>
        <LensSwitch />
      </header>

      {loading ? (
        <div className="story"><Skeleton h={22} w="40%" /><Skeleton h={60} /><Skeleton h={200} /></div>
      ) : !n ? (
        <p className="empty-big">The market data is resting. Pull to refresh in a moment.</p>
      ) : (
        <>
          <div className="st-progress" role="tablist" aria-label="Stories">
            {stories.map((_, k) => <button key={k} role="tab" aria-selected={k === i} aria-label={`Story ${k + 1} of ${n}`} className={k < i ? "done" : k === i ? "on" : ""} onClick={() => setI(k)}><i /></button>)}
          </div>
          <article
            className={`story story-${s.kind}`}
            aria-live="polite"
            aria-label={`Story ${i + 1} of ${n}`}
            onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); go(e.clientX - r.left < r.width / 3 ? -1 : 1); }}
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const t0 = touch.current; touch.current = null; if (!t0) return;
              const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
              if (Math.max(Math.abs(dx), Math.abs(dy)) > 40) go(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : (dy < 0 ? 1 : -1));
            }}
          >
            {s.kind === "mood" && (() => { const p = moodPlain(s.score); return (
              <>
                <span className="st-why">The market's mood</span>
                <div className="st-big">{s.score}<small>/100</small></div>
                <span className="st-meter" aria-hidden><i style={{ left: `${s.score}%` }} /></span>
                <h2>{p.headline}.</h2>
                <p className="st-line">{p.line}</p>
              </>
            ); })()}
            {s.kind === "report" && <ReportCard s={s} today={today} />}
            {s.kind === "macro" && (
              <>
                <span className="st-why">The big event this week</span>
                <h2 className="st-macro">{s.m.name}</h2>
                <p className="st-when">{whenPlain(s.m.date, "", today).replace(" (time not confirmed yet)", "")}</p>
                <p className="st-line">{s.m.blurb}</p>
              </>
            )}
            {s.kind === "cta" && (
              <>
                <span className="st-why">That's today</span>
                <h2>Saw a stock on <em>socials</em>?</h2>
                <p className="st-line">Paste the post. We'll show what the company actually does, how wild it swings and the red flags — before you buy.</p>
                <button className="cta cta-primary st-cta" onClick={() => navigate("/check")}>Check a stock you saw on socials</button>
                <button className="cta cta-secondary st-cta" onClick={() => navigate("/")}>See the whole calendar</button>
              </>
            )}
            <footer className="st-foot">
              <span className="eyebrow">{i + 1} / {n} · tap or swipe</span>
              {sh && <button className="st-share" onClick={(e) => { e.stopPropagation(); shareStory(sh.kind, sh.title, sh.text); }} aria-label="Share this card"><Icon name="share" size={14} /> Share</button>}
            </footer>
          </article>
          <div className="st-nav">
            <button className="btn btn-box sq" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous story"><Icon name="left" /></button>
            <button className="btn btn-box sq" onClick={() => go(1)} disabled={i >= n - 1} aria-label="Next story"><Icon name="right" /></button>
          </div>
        </>
      )}
      <InstallCoach />
    </div>
  );
}
