import { useEffect, useState, type ReactNode } from "react";
import { openAsk } from "../lib/ai";
import { navigate, setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Phase } from "./bits";

/** A moon drawn at any illuminated fraction: phase 0 = new, 0.5 = full, 1 = new again (waxing then waning). */
function MoonAt({ phase, r }: { phase: number; r: number }) {
  const waxing = phase < 0.5;
  const lit = waxing ? phase * 2 : (1 - phase) * 2; // 0..1 lit fraction
  const k = Math.cos(lit * Math.PI) * r; // terminator ellipse x-radius, signed
  const side = waxing ? 1 : 0; // lit limb on the right while waxing
  const d = `M0 ${-r} A${r} ${r} 0 0 ${side} 0 ${r} A${Math.abs(k)} ${r} 0 0 ${k > 0 ? 1 - side : side} 0 ${-r}Z`;
  return (
    <g>
      <circle r={r} className="ma-disc" />
      {lit > 0.02 && <path d={d} className="ma-lit" />}
      <circle r={r} className="ma-rim" />
    </g>
  );
}

/** The signature visual: one quarter of earnings season as a sweep of moon phases. */
export function MoonArc() {
  const N = 9;
  const W = 520, H = 250, cx = W / 2, cy = H - 18, R = 210;
  return (
    <svg className="moon-arc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Report timing drawn as moon phases: waxing before the open, full during market hours, waning after the close">
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} className="ma-track" />
      {Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const ang = Math.PI * (1 - t);
        const x = cx + R * Math.cos(ang), y = cy - R * Math.sin(ang);
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className="ma-moon" style={{ animationDelay: `${i * 0.38}s` }}>
            <MoonAt phase={0.06 + t * 0.88} r={i === 4 ? 22 : 15} />
          </g>
        );
      })}
      <g className="ma-labels">
        <text x={cx - R * 0.72} y={cy - R * 0.5}>BEFORE OPEN</text>
        <text x={cx} y={cy - R - 34} textAnchor="middle">DURING HOURS</text>
        <text x={cx + R * 0.72} y={cy - R * 0.5} textAnchor="end">AFTER CLOSE</text>
      </g>
      <text x={cx} y={cy - 28} textAnchor="middle" className="ma-caption">every company · every quarter</text>
    </svg>
  );
}

/** "How to read this": the moon key + result marks, one quiet strip. */
export function ReadKey({ compact }: { compact?: boolean }) {
  return (
    <div className={`read-key ${compact ? "compact" : ""}`} aria-label="How to read the calendar">
      <span className="eyebrow">How to read it</span>
      <span className="rk"><Phase h="bmo" size={13} /> Before open</span>
      <span className="rk"><Phase h="dmh" size={13} /> During hours</span>
      <span className="rk"><Phase h="amc" size={13} /> After close</span>
      <span className="rk-sep" />
      <span className="rk"><i className="rk-sw res-beat" /> Beat</span>
      <span className="rk"><i className="rk-sw res-mixed" /> Mixed</span>
      <span className="rk"><i className="rk-sw res-miss" /> Miss</span>
      {!compact && <span className="rk muted">Tap any logo for the full read</span>}
    </div>
  );
}

/** Scroll to the next trading day on the grid and pulse it. */
export function seeThisWeek() {
  setParam("d", null);
  requestAnimationFrame(() => setTimeout(() => {
    const el = document.querySelector<HTMLElement>(".cell.next, .wcol.next, .dayview");
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    if (el.tabIndex >= 0) el.focus({ preventScroll: true });
  }, 60));
}

/** Opens the AI ask panel on this week's reports + macro (free brain by default, or the viewer's own key). */
export const askTheCalendar = (task: "week" | "ask" = "week") => openAsk(task);

/** Home hero: full on a first visit, a slim one-line banner after it's been seen or dismissed. */
export function HomeHero({ monthCount, monthLabel }: { monthCount: number | null; monthLabel: string }) {
  const { prefs } = useStore();
  const [mode] = useState<"full" | "slim">(prefs.intro === "new" ? "full" : "slim");
  const [shown, setShown] = useState(mode);
  useEffect(() => { if (prefs.intro === "new") actions.setPref("intro", "seen"); }, []);

  if (shown === "slim") {
    return (
      <div className="hero-slim" role="region" aria-label="About Metaphases">
        <span className="hs-mark"><Phase h="dmh" size={12} /></span>
        <span className="hs-line">Every earnings report, <em>phase by phase.</em></span>
        <ReadKey compact />
        <button className="link small" onClick={() => setShown("full")}>Show intro</button>
      </div>
    );
  }
  return (
    <section className="hero" aria-labelledby="hero-title">
      <button className="hero-x icon-btn" onClick={() => { actions.setPref("intro", "dismissed"); setShown("slim"); }} aria-label="Dismiss intro"><Icon name="close" size={14} /></button>
      <div className="hero-copy">
        <span className="eyebrow hero-eyebrow"><i className="live-dot" /> Earnings season · {monthLabel}{monthCount ? ` · ${monthCount} reports` : ""}</span>
        <h2 id="hero-title" className="hero-title">Every earnings report, <em>phase by phase.</em></h2>
        <p className="hero-promise">Who reports, when, how the stock moved last time, and whether your money rides on it. Plain English, free, and never advice.</p>
        <div className="cta-row">
          <button className="cta cta-primary" onClick={seeThisWeek}>See this week <Icon name="right" size={14} /></button>
          <button className="cta cta-secondary" onClick={() => navigate("/compass")}>Map my portfolio</button>
          <button className="cta cta-ghost" onClick={() => askTheCalendar("week")}><span className="spark-glyph" aria-hidden>✦</span> Ask the calendar</button>
        </div>
      </div>
      <div className="hero-art"><MoonArc /></div>
      <ReadKey />
    </section>
  );
}

interface CTA { label: ReactNode; onClick: () => void; icon?: string }

/** Shared hero for the inner pages: headline with an italic serif accent, a dek, one primary + one secondary CTA. */
export function PageHero({ eyebrow, title, dek, primary, secondary, aside }: { eyebrow: string; title: ReactNode; dek: ReactNode; primary?: CTA; secondary?: CTA; aside?: ReactNode }) {
  return (
    <header className="page-hero">
      <div className="ph-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="headline">{title}</h1>
        <p className="dek">{dek}</p>
        {(primary || secondary) && (
          <div className="cta-row">
            {primary && <button className="cta cta-primary" onClick={primary.onClick}>{primary.label}{primary.icon && <Icon name={primary.icon} size={14} />}</button>}
            {secondary && <button className="cta cta-secondary" onClick={secondary.onClick}>{secondary.label}</button>}
          </div>
        )}
      </div>
      {aside && <div className="ph-aside">{aside}</div>}
    </header>
  );
}
