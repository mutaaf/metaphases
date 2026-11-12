import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Grade, Session } from "../../shared/types";
import { co } from "../lib/data";
import { GLOSSARY } from "../lib/glossary";
import { useStore } from "../lib/store";

/** The brand mark: a moon caught mid-phase. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mark">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16 3a13 13 0 0 1 0 26a8 13 0 0 1 0-26z" fill="currentColor" />
    </svg>
  );
}

/** Report timing as a moon phase: waxing = before open, full = during hours, waning = after close. */
/** `projected` (0007): the feed's guess, not the company's date: a dashed rim, the phase drawn faintly. */
export function Phase({ h, size = 12, projected }: { h: Session; size?: number; projected?: boolean }) {
  const r = 5.2;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={`phase phase-${h || "tbd"}${projected ? " phase-projected" : ""}`} aria-label={projected ? `${PHASE_LABEL[h]}, date not confirmed` : PHASE_LABEL[h]}>
      {h === "" ? (
        <circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.6 1.4" />
      ) : (
        <>
          <circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={projected ? "1.6 1.4" : undefined} />
          {h === "dmh" && <circle cx="6" cy="6" r={r} fill="currentColor" />}
          {h === "bmo" && <path d={`M6 ${6 - r}a${r} ${r} 0 0 1 0 ${2 * r}a2.6 ${r} 0 0 0 0-${2 * r}z`} fill="currentColor" />}
          {h === "amc" && <path d={`M6 ${6 - r}a${r} ${r} 0 0 0 0 ${2 * r}a2.6 ${r} 0 0 1 0-${2 * r}z`} fill="currentColor" />}
        </>
      )}
    </svg>
  );
}
export const PHASE_LABEL: Record<Session, string> = { bmo: "Before open", dmh: "During hours", amc: "After close", "": "Time TBD" };

/** Company tile — logo, or a typographic monogram when there's no logo or the viewer prefers tickers. */
export function Tile({ s, size = 44, force }: { s: string; size?: number; force?: "logo" | "ticker" }) {
  const { prefs } = useStore();
  const [broken, setBroken] = useState(false);
  const c = co(s);
  const mode = force ?? prefs.tiles;
  // Untracked reporters ("Everything" filter) try Finnhub's logo URL pattern; onError falls back to the monogram.
  const logo = c?.logo || (/^[A-Z]{1,5}$/.test(s) ? `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${s}.png` : "");
  const showLogo = mode === "logo" && logo && !broken;
  return (
    <span className={`tile ${showLogo ? "" : "tile-mono"}`} style={{ width: size, height: size }}>
      {showLogo ? (
        <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <b style={{ fontSize: s.length > 4 ? size * 0.2 : size * 0.25 }}>{s}</b>
      )}
    </span>
  );
}

export function GradeBadge({ g, size = "md" }: { g: Grade | null; size?: "sm" | "md" | "lg" }) {
  const tone = !g ? "none" : g.startsWith("A") ? "a" : g.startsWith("B") ? "b" : g.startsWith("C") ? "c" : "d";
  return <span className={`grade grade-${tone} grade-${size}`}>{g ?? "—"}</span>;
}

/** <Term k="pe">P/E</Term> — dotted underline; tap for the plain-English definition. */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const g = GLOSSARY[k];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!g) return <>{children}</>;
  return (
    <span className="term" ref={ref}>
      <button type="button" className="term-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open}>
        {children ?? g.term}
      </button>
      {open && (
        <span className="term-pop" role="tooltip">
          <span className="term-name">{g.term}</span>
          <span>{g.def}</span>
          {g.eg && <span className="term-eg">{g.eg}</span>}
        </span>
      )}
    </span>
  );
}

export function Spark({ data, w = 120, h = 32, tone }: { data: number[]; w?: number; h?: number; tone?: "up" | "down" }) {
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)}`).join(" ");
  const t = tone ?? (data[data.length - 1] >= data[0] ? "up" : "down");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`spark spark-${t}`} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Bar({ value, tone }: { value: number | null; tone?: string }) {
  return (
    <span className="meter">
      <span className={`meter-fill ${tone ?? ""}`} style={{ width: `${Math.max(2, value ?? 0)}%` }} />
    </span>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <span className="skel" style={{ height: h, width: w }} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    left: <path d="M10 3L5 8l5 5" />,
    right: <path d="M6 3l5 5-5 5" />,
    down: <path d="M4 6l4 4 4-4" />,
    search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></>,
    plus: <path d="M8 3v10M3 8h10" />,
    close: <path d="M4 4l8 8M12 4l-8 8" />,
    star: <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.6z" />,
    image: <><rect x="2.5" y="3" width="11" height="10" rx="1" /><circle cx="6" cy="6.5" r="1.2" /><path d="M2.5 11l3.5-3 3 2.5 2-1.5 2.5 2" /></>,
    month: <><rect x="2.5" y="2.5" width="4.5" height="4.5" /><rect x="9" y="2.5" width="4.5" height="4.5" /><rect x="2.5" y="9" width="4.5" height="4.5" /><rect x="9" y="9" width="4.5" height="4.5" /></>,
    week: <><rect x="2.5" y="2.5" width="11" height="11" /><path d="M6.2 2.5v11M9.8 2.5v11" /></>,
    day: <rect x="3" y="3" width="10" height="10" />,
    moon: <path d="M12.5 10A5.5 5.5 0 0 1 6 3.5a5.5 5.5 0 1 0 6.5 6.5z" />,
    sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>,
    share: <><path d="M8 2v8M5 5l3-3 3 3" /><path d="M3 9v4h10V9" /></>,
    github: <path d="M8 1.5a6.5 6.5 0 0 0-2 12.7c.3 0 .4-.2.4-.3v-1.2c-1.8.4-2.2-.8-2.2-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.6 0 1 .7 1 .7.6 1 1.5.7 1.9.5 0-.4.2-.7.4-.9-1.4-.2-3-.7-3-3.2 0-.7.3-1.3.7-1.7-.1-.2-.3-.9.1-1.8 0 0 .5-.2 1.8.7a6 6 0 0 1 3.2 0c1.3-.9 1.8-.7 1.8-.7.4.9.1 1.6.1 1.8.4.4.7 1 .7 1.7 0 2.5-1.5 3-3 3.2.2.2.4.6.4 1.2v1.8c0 .2.1.4.5.3A6.5 6.5 0 0 0 8 1.5z" fill="currentColor" stroke="none" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}

/** Share a link — native sheet on phones, clipboard elsewhere. */
export async function share(title: string, text: string, url: string, onCopied?: () => void) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url);
    onCopied?.();
  } catch {}
}
