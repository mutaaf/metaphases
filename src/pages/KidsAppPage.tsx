// /kids/app: "Moon Club on iPhone & iPad". The download link sits behind the parental gate (kids rules: no links out).
import { useState, type ComponentType } from "react";
import { BASE, navigate, href } from "../lib/router";
import { appLink } from "../../shared/kidsApp";
import { refFrom } from "../../shared/kidsLinks";

const SHOTS = [
  { src: "app/iphone-story.jpg", alt: "Today's Market Story on iPhone: the market's mood as weather, with a report card coming up" },
  { src: "app/iphone-quest-lemonade.jpg", alt: "Luna's Lemonade Stand quest on iPhone" },
  { src: "app/iphone-school.jpg", alt: "Moon School lessons on iPhone" },
];

/** Small card that points kids' grown-ups to the app. Used on the Story page and in the grown-up corner. */
export function AppNudge() {
  // A shared link's ?ref= rides along to /kids/app, where it becomes the App Store campaign token.
  const ref = refFrom(location.search);
  const to = `/kids/app${ref ? `?ref=${ref}` : ""}`;
  return (
    <a className="k-app-nudge" href={href(to)} onClick={(e) => { e.preventDefault(); navigate(to); }}>
      <img src={`${BASE}/kids-icon-512.png`} alt="" width={44} height={44} />
      <span><b>Moon Club is on iPhone &amp; iPad</b><small>Same Luna, smoother play, works offline.</small></span>
      <span className="k-app-nudge-go" aria-hidden>›</span>
    </a>
  );
}

export function AppPage({ Gate }: { Gate: ComponentType<{ onPass: () => void; onClose: () => void }> }) {
  const [gate, setGate] = useState(false);
  const [open, setOpen] = useState(false);
  const link = appLink(refFrom(location.search));
  return (
    <div className="k-page k-app">
      <header className="k-app-hero">
        <img className="k-app-icon" src={`${BASE}/kids-icon-512.png`} alt="Moon Club app icon" width={96} height={96} />
        <span className="k-eyebrow">For iPhone &amp; iPad</span>
        <h1>Moon Club, <em>in your pocket</em></h1>
        <p className="k-app-lede">Every quest, every Moon School lesson and Luna, built just for iPhone and iPad. It's smooth, it works offline, and it's still just as private.</p>
        <button className="k-btn k-btn-primary k-app-cta" onClick={() => setGate(true)}>Get the app</button>
        <p className="k-small">A grown-up does the download.</p>
      </header>

      <ul className="k-app-shots" aria-label="Screenshots">
        {SHOTS.map((s) => <li key={s.src}><img src={`${BASE}/${s.src}`} alt={s.alt} loading="lazy" width={540} height={1174} /></li>)}
      </ul>

      <section className="k-section k-app-why">
        <h2>Why the app</h2>
        <ul className="k-list">
          <li><b>Made for touch.</b> Springy animations, haptics, and a moving aurora sky that pauses to save battery.</li>
          <li><b>Luna can think on the device.</b> On iPhones and iPads with Apple Intelligence, kids' questions never leave the device.</li>
          <li><b>Same club.</b> Family League codes work between the app and this website.</li>
          <li><b>Same promises.</b> Pretend money only, no ads, no accounts, no tracking. <a href={href("/kids/privacy")} onClick={(e) => { e.preventDefault(); navigate("/kids/privacy"); }}>Read the privacy policy</a>.</li>
          <li><b>Questions?</b> <a href={href("/kids/support")} onClick={(e) => { e.preventDefault(); navigate("/kids/support"); }}>Help &amp; support</a> has answers for grown-ups and a way to reach us.</li>
        </ul>
      </section>

      {open && (
        <section className="k-section k-app-get" aria-live="polite">
          <h2>{link?.kind === "store" ? "Download Moon Club" : "Join the Moon Club beta"}</h2>
          {link ? (
            link.kind === "store" ? (
              <a className="k-btn k-btn-primary" href={link.url} rel="noopener">Open in the App Store</a>
            ) : (
              <>
                <ol className="k-list k-app-steps">
                  <li>Install Apple's free <b>TestFlight</b> app from the App Store.</li>
                  <li>On the iPhone or iPad, tap the button below and choose <b>Accept</b>, then <b>Install</b>.</li>
                </ol>
                <a className="k-btn k-btn-primary" href={link.url} rel="noopener">Join on TestFlight</a>
                <p className="k-small">It's a beta for family and friends. New versions arrive on their own.</p>
              </>
            )
          ) : (
            <p className="k-small" data-testid="app-soon">The beta opens very soon. Apple is giving it a quick review. Until then, everything works right here on the website.</p>
          )}
        </section>
      )}
      <div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids")}>Back to the club</button></div>
      {gate && <Gate onPass={() => { setGate(false); setOpen(true); }} onClose={() => setGate(false)} />}
    </div>
  );
}
