import { useMemo, useRef, useState } from "react";
import { UNIVERSE } from "../lib/data";
import { useDialog } from "../lib/dialog";
import { setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Tile } from "../components/bits";

export default function Search({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose, { initialFocus: "input" });
  const { watch } = useStore();
  const results = useMemo(() => {
    const Q = q.trim().toUpperCase();
    if (!Q) return Object.entries(UNIVERSE).sort((a, b) => b[1].mc - a[1].mc).slice(0, 8).map(([s]) => s);
    const all = Object.entries(UNIVERSE);
    const exact = all.filter(([s]) => s === Q).map(([s]) => s);
    const starts = all.filter(([s]) => s.startsWith(Q) && s !== Q).sort((a, b) => b[1].mc - a[1].mc).map(([s]) => s);
    const name = all.filter(([s, c]) => !s.startsWith(Q) && c.n.toUpperCase().includes(Q)).sort((a, b) => b[1].mc - a[1].mc).map(([s]) => s);
    const r = [...exact, ...starts, ...name].slice(0, 10);
    return r.length || !/^[A-Z.\-]{1,6}$/.test(Q) ? r : [Q];
  }, [q]);
  const pick = (s: string) => { onClose(); setParam("t", s); };
  return (
    <div className="drawer-scrim center" onClick={onClose}>
      <div className="palette" ref={box} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search tickers">
        <div className="pal-input"><Icon name="search" /><input value={q} aria-label="Search a ticker or company" placeholder="Search a ticker or company…" onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(results.length - 1, i + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); } else if (e.key === "Enter" && results[i]) pick(results[i]); }} /><kbd>esc</kbd></div>
        <ul>
          {!q && <li className="pal-hint eyebrow">Largest companies</li>}
          {results.map((s, k) => {
            const c = UNIVERSE[s];
            const on = watch.some((w) => w.s === s);
            return (
              <li key={s} className={k === i ? "on" : ""} onMouseEnter={() => setI(k)}>
                <button className="pal-row" onClick={() => pick(s)}><Tile s={s} size={30} /><b>{s}</b><span className="muted">{c?.n ?? "Look up this ticker"}</span></button>
                <button className={`icon-btn ${on ? "starred" : ""}`} onClick={() => actions.toggleWatch(s)} aria-pressed={on} aria-label={on ? `Remove ${s} from watchlist` : `Add ${s} to watchlist`} title={on ? "On your watchlist" : "Add to watchlist"}><Icon name="star" size={14} /></button>
              </li>
            );
          })}
        </ul>
        <div className="pal-foot eyebrow">↑↓ to move · enter to open · ★ to watch · esc to close</div>
      </div>
    </div>
  );
}
