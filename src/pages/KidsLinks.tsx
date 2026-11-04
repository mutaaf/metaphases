// Deep-link pages (shared/kidsLinks.ts). With Moon Club installed these URLs open the app; without it they land
// here: the matching /kids content, plus the way to the app (the download link itself stays behind the gate on
// /kids/app). App-only features explain themselves and point at the nearest thing that works on the web.
import { useState, type ComponentType, type ReactNode } from "react";
import { navigate } from "../lib/router";
import { packById, refFrom } from "../../shared/kidsLinks";
import { PARTNER_DISCLOSURE, PARTNER_REL, shownPartners } from "../../shared/kidsPartners";
import { AppNudge } from "./KidsAppPage";

type Gate = ComponentType<{ onPass: () => void; onClose: () => void }>;

function AppOnly({ eyebrow, title, accent, children, tryHere }: { eyebrow: string; title: string; accent: string; children: ReactNode; tryHere?: { label: string; to: string } }) {
  return (
    <div className="k-page k-linkpage">
      <header className="k-app-hero">
        <span className="k-eyebrow">{eyebrow}</span>
        <h1>{title} <em>{accent}</em></h1>
        <div className="k-app-lede">{children}</div>
      </header>
      <AppNudge />
      <div className="k-nav">
        {tryHere && <button className="k-btn k-btn-primary" onClick={() => navigate(tryHere.to)}>{tryHere.label}</button>}
        <button className="k-btn" onClick={() => navigate("/kids")}>Back to the club</button>
      </div>
    </div>
  );
}

export function GameNightLink() {
  return (
    <AppOnly eyebrow="In the Moon Club app" title="Game Night," accent="two players" tryHere={{ label: "Play Guess the Report Card", to: "/kids/guess" }}>
      <p>Two players, one phone or iPad. Each of you guesses the same report cards, and Luna keeps score. On a folding phone, each player gets their own half.</p>
      <p>Game Night lives in the app. Here on the website you can still play Guess the Report Card.</p>
    </AppOnly>
  );
}

export function GardenLink() {
  return (
    <AppOnly eyebrow="In the Moon Club app" title="The Moon" accent="Garden" tryHere={{ label: "Try the pretend Piggy Bank", to: "/kids/piggy" }}>
      <p>Plant the Moon points you earned in companies you know, and watch them grow or shrink with real daily prices. Points only, never money.</p>
      <p>The garden lives in the app. Here on the website you can practise with the pretend Piggy Bank.</p>
    </AppOnly>
  );
}

export function PackLink({ id }: { id: string }) {
  const p = packById(id);
  if (!p) {
    return (
      <AppOnly eyebrow="Lesson pack" title="We couldn't find" accent="that pack" tryHere={{ label: "Go to Moon School", to: "/kids/school" }}>
        <p>That link doesn't match a pack we have. Moon School has lots of lessons to try.</p>
      </AppOnly>
    );
  }
  return (
    <AppOnly eyebrow={p.creator ? `Lesson pack · guest host ${p.creator}` : "Lesson pack"} title={p.title} accent="" tryHere={{ label: "Go to Moon School", to: "/kids/school" }}>
      <p>A lesson pack adds new lessons and an island to the map in the Moon Club app. Every pack is checked by a teacher and a markets expert.</p>
      <p>A grown-up turns it on in the app: For grown-ups → Lesson packs.</p>
    </AppOnly>
  );
}

/** /kids/league/<code>: someone shared their Family League code. Adding a player is a grown-up step, so the gate first. */
export function LeagueLink({ code, Gate, Setup }: { code: string; Gate: Gate; Setup: ComponentType<{ initial?: string }> }) {
  const [gate, setGate] = useState(false);
  const [open, setOpen] = useState(false);
  if (open) return <div className="k-page"><Setup initial={code} /><div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids/guess")}>See the league on Guess</button></div></div>;
  return (
    <div className="k-page k-linkpage">
      <header className="k-app-hero">
        <span className="k-eyebrow">Family league</span>
        <h1>You're invited <em>to a league</em></h1>
        <p className="k-app-lede">Someone shared their guesses so you can compare. The code holds only companies, dates and guesses. A grown-up adds it.</p>
        <button className="k-btn k-btn-primary k-app-cta" onClick={() => setGate(true)}>Add to our league</button>
      </header>
      <AppNudge />
      <div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids/guess")}>Go to Guess</button></div>
      {gate && <Gate onPass={() => { setGate(false); setOpen(true); }} onClose={() => setGate(false)} />}
    </div>
  );
}

/** The app nudge under a deep-linked page (guess, piggy, school, a lesson) that someone shared with a ?ref=. */
export function SharedLinkNudge() {
  return refFrom(location.search) ? <div className="k-shared-nudge"><AppNudge /></div> : null;
}

/** Grown-up picks (affiliate slot): grown-up corner only, behind the gate. Ships EMPTY (shared/kidsPartners.ts). */
export function GrownUpPicks() {
  const picks = shownPartners();
  if (!picks.length) return null;
  return (
    <section className="k-section k-picks" aria-label="Grown-up picks">
      <h2>Grown-up picks</h2>
      <p className="k-small" data-testid="partner-disclosure">{PARTNER_DISCLOSURE}</p>
      <ul className="k-list">
        {picks.map((p) => (
          <li key={p.id}><a href={p.url} rel={PARTNER_REL} target="_blank"><b>{p.title}</b></a> <span className="k-small">Partner link.</span><br />{p.blurb}</li>
        ))}
      </ul>
    </section>
  );
}
