// The Everyday investor's shell: lens picker, lens switch, the phone tab bar and the
// "add to home screen" coach mark. Small on purpose — this ships in the main bundle.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDialog } from "../lib/dialog";
import { appPath, href, navigate, useLocation } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Mark } from "./bits";

const PHONE = "(max-width: 760px)";
export function useIsPhone() {
  return useSyncExternalStore(
    (f) => { const m = matchMedia(PHONE); m.addEventListener("change", f); return () => m.removeEventListener("change", f); },
    () => matchMedia(PHONE).matches,
  );
}
export const isEveryday = (lens: string) => lens !== "trader";

/** First visit: "how do you invest?" — sets the lens, never blocks for long. */
export function LensPicker() {
  const { prefs } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const choose = (lens: "everyday" | "trader" | "kids") => {
    actions.setPref("lens", lens);
    if (lens === "kids") { navigate("/kids", true); return; }
    if (lens === "everyday" && matchMedia(PHONE).matches && appPath() === "/") navigate("/today", true);
  };
  useDialog(ref, () => choose("everyday"));
  if (prefs.lens !== "unset") return null;
  return (
    <div className="drawer-scrim center lens-scrim">
      <div className="lens-pick" ref={ref} role="dialog" aria-modal="true" aria-labelledby="lens-title">
        <Mark size={28} />
        <h2 id="lens-title">How do you <em>invest</em>?</h2>
        <p className="muted">We'll set Metaphases up to fit. You can switch any time.</p>
        <button className="lens-opt" onClick={() => choose("everyday")}>
          <b>I invest for the long run</b>
          <span>Plain English, what matters to my money, quick daily stories. No jargon.</span>
        </button>
        <button className="lens-opt" onClick={() => choose("trader")}>
          <b>I trade actively</b>
          <span>The full desk: setup grades, RSI, volatility, reactions, every number.</span>
        </button>
        <button className="lens-opt lens-kids" onClick={() => choose("kids")}>
          <b>We're learning with our kid</b>
          <span>Metaphases Kids: pretend money, real prices, report-card games and Moon School. No ads, nothing to buy.</span>
        </button>
      </div>
    </div>
  );
}

/** Small "Viewing as" switch, used in the colophon, Today and Hype Check. */
export function LensSwitch() {
  const { prefs } = useStore();
  const everyday = isEveryday(prefs.lens);
  return (
    <span className="lens-switch">
      <span className="eyebrow">Viewing as</span>
      <button className={everyday ? "on" : ""} onClick={() => actions.setPref("lens", "everyday")} aria-pressed={everyday}>Everyday</button>
      <button className={!everyday ? "on" : ""} onClick={() => actions.setPref("lens", "trader")} aria-pressed={!everyday}>Trader</button>
    </span>
  );
}

const TABS = [
  { path: "/today", label: "Today", icon: <><circle cx="10" cy="10" r="6.5" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13a3.6 6.5 0 0 1 0-13z" fill="currentColor" /></> },
  { path: "/", label: "Calendar", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="1" /><path d="M3.5 8.5h13M7 2.8v3M13 2.8v3" /></> },
  { path: "/check", label: "Hype Check", icon: <><circle cx="9" cy="9" r="5" /><path d="M12.8 12.8l3.7 3.7M7 9l1.4 1.4L11 7.6" /></> },
  { path: "/compass", label: "My Money", icon: <><rect x="2.5" y="5.5" width="15" height="10.5" rx="1.5" /><path d="M13 10.7h4.5M5 5.5l7-2.6 1.2 2.6" /></> },
];

/** Thumb-reach navigation on phones. */
export function TabBar() {
  useLocation();
  const path = appPath();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        const on = path === t.path;
        return (
          <a key={t.path} href={href(t.path)} className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={(e) => { e.preventDefault(); navigate(t.path); }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{t.icon}</svg>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

interface BIPEvent extends Event { prompt: () => Promise<void> }
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; });

/** "Add Metaphases to your home screen" — once, on phones, not when already installed. */
export function InstallCoach() {
  const { prefs } = useStore();
  const phone = useIsPhone();
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  useEffect(() => { const f = () => setCanPrompt(true); window.addEventListener("beforeinstallprompt", f); return () => window.removeEventListener("beforeinstallprompt", f); }, []);
  const standalone = typeof matchMedia !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone);
  if (!phone || standalone || prefs.install === "dismissed") return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <aside className="coach" aria-label="Add to home screen">
      <Mark size={22} />
      <div>
        <b>Keep Metaphases one tap away</b>
        <span>
          {ios ? <>Tap <b>Share</b> <span aria-hidden>⬆︎</span> then <b>Add to Home Screen</b>.</> : canPrompt ? "Install it like an app." : <>Open the browser menu <span aria-hidden>⋮</span> and tap <b>Add to Home screen</b>.</>}
          {" "}Then share any post from Instagram, TikTok or X straight to Metaphases for a Hype Check.
        </span>
      </div>
      <div className="coach-actions">
        {canPrompt && !ios && <button className="cta cta-primary" onClick={async () => { await deferred?.prompt(); deferred = null; actions.setPref("install", "dismissed"); }}>Install</button>}
        <button className="icon-btn" onClick={() => actions.setPref("install", "dismissed")} aria-label="Dismiss">✕</button>
      </div>
    </aside>
  );
}
