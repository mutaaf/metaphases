import { useState } from "react";
import { useMacro } from "../lib/api";
import { daysBetween, fmtLong, fmtShort, todayISO } from "../lib/dates";
import { Icon, Skeleton, Spark, Term } from "./bits";

const MOOD_TONES = ["#B23A2E", "#D0805A", "#C9B48F", "#8FB59E", "#2F7D57"];

export function MoodMeter({ score, compact }: { score: number; compact?: boolean }) {
  return (
    <span className={`mood-meter ${compact ? "compact" : ""}`} aria-label={`Market mood ${score} of 100`}>
      {MOOD_TONES.map((c, i) => <span key={i} style={{ background: c }} />)}
      <i style={{ left: `${score}%` }} />
    </span>
  );
}

export function MacroStrip() {
  const { data, loading, error } = useMacro();
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const upcoming = (data?.events ?? []).filter((e) => e.date >= today);
  // One of each kind for the strip, nearest first.
  const seen = new Set<string>();
  const strip = upcoming.filter((e) => (["jobs", "cpi", "fomc", "gdp", "pce"].includes(e.key) && !seen.has(e.key) ? (seen.add(e.key), true) : false)).slice(0, 4);
  const mood = data?.mood;
  const tone = mood ? (mood.score < 45 ? "fear" : mood.score > 55 ? "greed" : "neutral") : "neutral";

  return (
    <section className={`macro ${open ? "open" : ""}`}>
      <div className="macro-row">
        <div className="macro-mood">
          <span className="eyebrow"><Term k="mood">Market mood</Term></span>
          {loading && !mood ? <Skeleton w={120} h={18} /> : mood ? (
            <>
              <b className="mood-num">{mood.score}</b>
              <span className={`mood-label tone-${tone}`}>{mood.label}</span>
              <MoodMeter score={mood.score} compact />
            </>
          ) : <span className="muted small">resting</span>}
        </div>
        <div className="macro-events">
          {loading && !data && [0, 1, 2, 3].map((i) => <Skeleton key={i} w={140} h={14} />)}
          {strip.map((e) => {
            const n = daysBetween(today, e.date);
            return (
              <button key={e.key + e.date} className="macro-ev" onClick={() => setOpen(true)} title={e.blurb}>
                <span className="ev-name">{e.name}</span>
                <span className="eyebrow">{n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}</span>
              </button>
            );
          })}
          {error && <span className="muted small">Economic calendar is offline — earnings still load.</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Collapse" : "Expand"} <span className={`chev ${open ? "up" : ""}`}><Icon name="down" size={12} /></span>
        </button>
      </div>

      {open && data && (
        <div className="macro-detail">
          <div className="mood-detail">
            <div className="mood-head">
              <div>
                <span className="eyebrow">Market mood · 0 fear → 100 greed</span>
                <div className="mood-big"><b>{mood?.score ?? "—"}</b><span className={`tone-${tone}`}>{mood?.label}</span></div>
              </div>
              {mood && <Spark data={mood.history} w={180} h={44} tone={mood.history[mood.history.length - 1] >= mood.history[0] ? "up" : "down"} />}
            </div>
            {mood && <MoodMeter score={mood.score} />}
            <p className="muted small">Our own gauge, built the Market Digest way: six signals you can check, each scored 0–100 and averaged. The line traces the last 60 trading days.</p>
            <ul className="mood-comps">
              {mood?.components.map((c) => (
                <li key={c.key} title={c.why}>
                  <span className="mc-label">{c.label}</span>
                  <span className="mc-bar"><span style={{ width: `${c.score}%`, background: MOOD_TONES[Math.min(4, Math.floor(c.score / 20))] }} /></span>
                  <b>{c.score}</b>
                  <span className="mc-read">{c.reading}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="macro-list">
            <span className="eyebrow">The next 60 days in the economy</span>
            <ol>
              {upcoming.filter((e) => daysBetween(today, e.date) <= 60).map((e) => (
                <li key={e.key + e.date} className={`kind-${e.kind}`}>
                  <span className="ml-date">{fmtShort(e.date)}</span>
                  <span className="ml-body">
                    <b>{e.name}</b>
                    <span className="muted">{e.blurb}</span>
                  </span>
                  <span className="eyebrow ml-in" title={fmtLong(e.date)}>{daysBetween(today, e.date)}d</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
