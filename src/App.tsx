import { useEffect, useState } from "react";
import { CalendarPage } from "./components/Calendar";
import { MacroStrip } from "./components/MacroStrip";
import { CompassPage, LearnPage, RetracePage, Search, WatchlistPage } from "./components/Pages";
import { TickerSheet } from "./components/TickerSheet";
import { Icon, Mark, Phase } from "./components/bits";
import { appPath, href, navigate, param, setParam, useLocation } from "./lib/router";
import { actions, useStore } from "./lib/store";
import { nowNY } from "./lib/dates";
import { AiLayer, AiTopButton } from "./components/ai/mount";

const NAV = [
  { path: "/", label: "Calendar" },
  { path: "/watchlist", label: "Watchlist" },
  { path: "/compass", label: "Compass" },
  { path: "/retrace", label: "Retrace" },
  { path: "/learn", label: "Learn" },
];

export default function App() {
  const loc = useLocation();
  const { prefs } = useStore();
  const [search, setSearch] = useState(false);
  const path = appPath();

  // Share URLs: /t/AAPL opens the calendar with AAPL's sheet on top.
  useEffect(() => {
    const m = path.match(/^\/t\/([A-Za-z.\-]{1,10})$/);
    if (m) navigate(`/?t=${m[1].toUpperCase()}`, true);
  }, [path]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      else if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  const t = param("t");
  const dark = prefs.theme === "dark" || (prefs.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const page = path === "/watchlist" ? <WatchlistPage onSearch={() => setSearch(true)} /> : path === "/compass" ? <CompassPage /> : path === "/retrace" ? <RetracePage /> : path === "/learn" ? <LearnPage /> : <CalendarPage onSearch={() => setSearch(true)} />;
  const ny = nowNY();

  return (
    <div className="app" data-loc={loc}>
      <header className="top">
        <a className="brand" href={href("/")} onClick={(e) => { e.preventDefault(); navigate("/"); }}><Mark /> <span>Metaphases</span></a>
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={path === n.path ? "on" : ""} onClick={(e) => { e.preventDefault(); navigate(n.path); }}>{n.label}</a>
          ))}
        </nav>
        <button className="top-search" onClick={() => setSearch(true)} aria-label="Search ticker"><Icon name="search" size={14} /> <span>Search ticker</span> <kbd>⌘K</kbd></button>
        <AiTopButton />
        <a className="top-icon" href="https://github.com/mutaaf/metaphases" target="_blank" rel="noreferrer" aria-label="Source on GitHub"><Icon name="github" /></a>
        <button className="top-icon" onClick={() => actions.setPref("theme", dark ? "light" : "dark")} aria-label={dark ? "Switch to light" : "Switch to dark"}><Icon name={dark ? "sun" : "moon"} /></button>
      </header>
      <div className="frame">
        <MacroStrip />
        <main>{page}</main>
        <footer className="legend">
          <div className="legend-keys">
            <span className="eyebrow">Legend:</span>
            <span className="lk res-beat">Beat</span><span className="lk res-mixed">Mixed</span><span className="lk res-miss">Miss</span>
            <span className="lk">No mark · upcoming</span>
            <span className="lk"><Phase h="bmo" size={11} /> Before open</span>
            <span className="lk"><Phase h="dmh" size={11} /> During hours</span>
            <span className="lk"><Phase h="amc" size={11} /> After close</span>
            <span className="lk"><Phase h="" size={11} /> Time TBD</span>
          </div>
          <span className="eyebrow">Data · Finnhub · FRED · Nasdaq · Yahoo</span>
        </footer>
      </div>
      <footer className="colophon">
        <span className="eyebrow">Charted in Texas by <a href="https://mutaafaziz.com">Mutaaf Aziz</a> · grades are explained, never advice · sibling of Market Digest &amp; Compass</span>
        <span className="eyebrow">{ny.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}</span>
      </footer>
      {t && <TickerSheet symbol={t.toUpperCase()} onClose={() => setParam("t", null)} />}
      {search && <Search onClose={() => setSearch(false)} />}
      <AiLayer />
    </div>
  );
}
