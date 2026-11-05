import { lazy, Suspense, useEffect, useState } from "react";
import { CalendarPage } from "./components/Calendar";
import { MacroStrip } from "./components/MacroStrip";
import { TickerSheet } from "./components/TickerSheet";
import { Icon, Mark, Phase, Skeleton } from "./components/bits";
import { appPath, href, navigate, param, setParam, useLocation } from "./lib/router";
import { actions, useStore } from "./lib/store";
import { nowNY } from "./lib/dates";
import { AiLayer, AiTopButton } from "./components/ai/mount";
import { SHARE_TICKER } from "./lib/deepLink";
import { isEveryday, LensNote, LensPicker, LensSwitch, TabBar } from "./components/Everyday";

// The calendar ships in the main bundle; every other page loads on demand.
const WatchlistPage = lazy(() => import("./pages/Watchlist"));
const CompassPage = lazy(() => import("./pages/Compass"));
const RetracePage = lazy(() => import("./pages/Retrace"));
const LearnPage = lazy(() => import("./pages/Learn"));
const AboutPage = lazy(() => import("./pages/About"));
const Search = lazy(() => import("./pages/Search"));
const TodayPage = lazy(() => import("./pages/Today"));
const CheckPage = lazy(() => import("./pages/Check"));
// Metaphases Kids has its own child-safe shell (no trader UI, no links out), loaded on demand.
const KidsApp = lazy(() => import("./pages/Kids"));

// Everyday investors on a phone land on Today the first time the app opens (not on later Calendar taps).
let landed = false;

const NAV = [
  { path: "/today", label: "Today" },
  { path: "/", label: "Calendar" },
  { path: "/check", label: "Hype Check" },
  { path: "/watchlist", label: "Watchlist" },
  { path: "/compass", label: "Compass" },
  { path: "/retrace", label: "Retrace" },
  { path: "/learn", label: "Learn" },
  { path: "/kids", label: "Kids" },
  { path: "/about", label: "About" },
];

function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <Skeleton w={120} h={11} />
      <Skeleton w="62%" h={56} />
      <Skeleton w="48%" h={18} />
      <Skeleton h={240} />
    </div>
  );
}

export default function App() {
  const loc = useLocation();
  const { prefs } = useStore();
  const [search, setSearch] = useState(false);
  const path = appPath();

  useEffect(() => {
    if (landed) return;
    landed = true;
    // Kids mode (/kids) is its own place: the home page always opens the grown-up app, whatever was picked.
    if (prefs.lens === "everyday" && path === "/" && !location.search && matchMedia("(max-width: 760px)").matches) navigate("/today", true);
  }, []);

  // Share URLs: /t/AAPL opens the calendar with AAPL's sheet on top.
  useEffect(() => {
    const m = path.match(SHARE_TICKER);
    if (m) navigate(`/?t=${m[1].toUpperCase()}`, true);
  }, [path]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector(".lens-scrim")) return; // the lens picker is up: answer it first
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      else if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  // New page → top of the page (not when only the query changes, e.g. opening a sheet).
  useEffect(() => { if (!location.hash) window.scrollTo({ top: 0 }); }, [path]);

  if (path === "/kids" || path.startsWith("/kids/")) return <Suspense fallback={<PageSkeleton />}><KidsApp /></Suspense>;

  const t = param("t");
  const dark = prefs.theme === "dark" || (prefs.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const openSearch = () => setSearch(true);
  const page =
    path === "/watchlist" ? <WatchlistPage onSearch={openSearch} /> :
    path === "/compass" ? <CompassPage /> :
    path === "/retrace" ? <RetracePage /> :
    path === "/learn" ? <LearnPage /> :
    path === "/about" ? <AboutPage /> :
    path === "/today" ? <TodayPage /> :
    path === "/check" ? <CheckPage /> :
    <CalendarPage onSearch={openSearch} />;
  const ny = nowNY();
  // Today and Hype Check are single-purpose phone screens: no macro strip, no floating Ask (they have their own).
  const focusRoute = path === "/today" || path === "/check";

  return (
    <div className={`app lens-${isEveryday(prefs.lens) ? "everyday" : "trader"}${focusRoute ? " focus-route" : ""}`} data-loc={loc}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href={href("/")} onClick={(e) => { e.preventDefault(); navigate("/"); }} aria-label="Metaphases home"><Mark /> <span>Metaphases</span></a>
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={path === n.path ? "on" : ""} aria-current={path === n.path ? "page" : undefined} onClick={(e) => { e.preventDefault(); navigate(n.path); }}>{n.label}</a>
          ))}
        </nav>
        <button className="top-search" onClick={openSearch} aria-label="Search ticker"><Icon name="search" size={14} /> <span>Search ticker</span> <kbd>⌘K</kbd></button>
        <AiTopButton />
        <a className="top-icon gh" href="https://github.com/mutaaf/metaphases" target="_blank" rel="noreferrer" aria-label="Source on GitHub"><Icon name="github" /></a>
        <button className="top-icon" onClick={() => actions.setPref("theme", dark ? "light" : "dark")} aria-label={dark ? "Switch to light" : "Switch to dark"}><Icon name={dark ? "sun" : "moon"} /></button>
      </header>
      <div className="frame">
        {!focusRoute && <MacroStrip />}
        <main id="main" tabIndex={-1}>{!t && !focusRoute && <LensNote />}<Suspense fallback={<PageSkeleton />}>{page}</Suspense></main>
        <footer className="legend">
          <div className="legend-keys">
            <span className="eyebrow">Legend:</span>
            <span className="lk res-beat">Beat</span><span className="lk res-mixed">Mixed</span><span className="lk res-miss">Miss</span>
            <span className="lk lk-upcoming">No mark · upcoming</span>
            <span className="lk"><Phase h="bmo" size={11} /> Before open</span>
            <span className="lk"><Phase h="dmh" size={11} /> During hours</span>
            <span className="lk"><Phase h="amc" size={11} /> After close</span>
            <span className="lk"><Phase h="" size={11} /> Time TBD</span>
          </div>
          <span className="eyebrow">Data · Finnhub · FRED · Nasdaq · Yahoo</span>
        </footer>
      </div>
      <footer className="colophon">
        <span className="eyebrow">Charted in Texas by <a href="https://mutaafaziz.com">Mutaaf Aziz</a> · grades are explained, never advice · <a href={href("/about")} onClick={(e) => { e.preventDefault(); navigate("/about"); }}>sibling of Market Digest &amp; Compass</a></span>
        <LensSwitch />
        <span className="eyebrow">{ny.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}</span>
      </footer>
      <TabBar />
      <LensPicker />
      {t && <TickerSheet symbol={t.toUpperCase()} onClose={() => setParam("t", null)} />}
      {search && <Suspense fallback={null}><Search onClose={() => setSearch(false)} /></Suspense>}
      <AiLayer />
    </div>
  );
}
