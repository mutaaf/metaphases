// /kids/support: "Moon Club help & support", the App Store Support URL (Guideline 1.5).
// Written for grown-ups. Every answer must match the app (mutaaf/moon-club MoonClub/, docs/) —
// check the code before changing one. The contact form posts to /api/kids/support (worker/support.ts):
// stored 180 days in KV, only to reply. No third parties, no tracking, no links out.
import { useState, type FormEvent, type ReactNode } from "react";
import { BASE, href, navigate } from "../lib/router";
import { PRIVACY_CONTACT } from "./KidsPrivacy";

export const SUPPORT_MAX = 2000;

const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(to); };
const Link = ({ to, children }: { to: string; children: ReactNode }) => <a href={href(to)} onClick={go(to)}>{children}</a>;

const FAQ: { id: string; q: string; a: ReactNode }[] = [
  {
    id: "what",
    q: "What is Moon Club?",
    a: <>
      <p>Moon Club teaches kids (about 8 to 12) how money, companies and markets work, best enjoyed with a grown-up nearby. Luna the moon guides them through quests, one-minute Moon School lessons, Guess the Report Card, a Pretend Piggy Bank and the Moon Garden.</p>
      <p>It uses <b>real company names and real prices</b>, but <b>only pretend money</b>. The same club also runs on the web at mutaafaziz.com/metaphases/kids.</p>
    </>,
  },
  {
    id: "money",
    q: "Is any real money involved? Can my child buy or trade anything?",
    a: <>
      <p><b>No.</b> All money and points in Moon Club are pretend. There's no trading, no broker, no "buy" button and no in-app purchases. The app is free.</p>
      <p>There are also <b>no ads, no accounts or sign-up, and no analytics or tracking</b>. We don't collect data about your child. Nothing in the app is investment advice.</p>
    </>,
  },
  {
    id: "luna",
    q: "How does Ask Luna work? Where do questions go?",
    a: <>
      <p>Kids can type a money question (up to 200 characters) or tap a ready-made one. Luna answers in short, simple words and stays on money topics. There's no voice input.</p>
      <ul>
        <li><b>On iPhones and iPads with Apple Intelligence</b> (iOS 26 or later), Luna thinks <b>on the device</b>. The question never leaves it.</li>
        <li><b>Otherwise</b>, the question text goes to our free helper at mutaafaziz.com, which writes the answer with Cloudflare Workers AI. It's text only, with no name, account or device ID, and <b>the server keeps nothing</b>.</li>
      </ul>
      <p>You can see or change this under <b>For grown-ups → Luna's brain</b>. Answers may be kept on the device for up to 7 days so repeat questions load fast. Luna reminds kids not to type their name, school or where they live; please remind them too. Like any AI, she can make mistakes, so stay nearby.</p>
    </>,
  },
  {
    id: "gate",
    q: "What is the grown-up check?",
    a: <>
      <p>Tap <b>For grown-ups</b> (the lock button at the top). The app asks a times-table question, like "What is 7 × 8?". A right answer opens the grown-up corner; a wrong one gives a new question.</p>
      <p>Everything a child shouldn't change alone sits behind it: Luna's brain, Family League, lesson packs, iCloud sync, reset, game settings, sharing and every link that leaves the app.</p>
    </>,
  },
  {
    id: "reset",
    q: "How do we reset progress and start over?",
    a: <ol>
      <li>Tap <b>For grown-ups</b> and answer the question.</li>
      <li>Scroll to <b>More</b> and tap <b>Reset all progress…</b></li>
      <li>Choose <b>Reset this device</b>. If iCloud sync is on, you can pick <b>Reset on all devices</b> or <b>This device only</b>.</li>
    </ol>,
  },
  {
    id: "league",
    q: "What are Family League codes?",
    a: <>
      <p>Family League lets kids on different devices compare their Guess the Report Card picks. In <b>For grown-ups → Family league</b>, each player picks an emoji (never a name). Then copy or share this device's code, and on the other device paste it into <b>Paste a code from another device</b> and tap <b>Add player</b>.</p>
      <p>A code looks like <b>MOON-1…</b> and holds only companies, dates and guesses. Codes work between the app and the website.</p>
    </>,
  },
  {
    id: "packs",
    q: "What are lesson packs?",
    a: <>
      <p>Lesson packs add extra Moon School lessons and a new island on the map. The core course is always on. Packs are <b>never on by default</b>: a grown-up turns one on with its switch in <b>For grown-ups → Lesson packs</b>. The choice is saved on that device only.</p>
      <p>Packs come with the app; it doesn't download them from the internet.</p>
    </>,
  },
  {
    id: "duo",
    q: "What are the iPhone Duo features?",
    a: <>
      <p>On a foldable <b>iPhone Duo</b> (iOS 27.1 or later), Moon Club uses the fold: two-page storybook lessons, Luna's moon phase following the hinge, a piggy bank lid that opens, the hinge as a dial in some games, and Duo-only trophies.</p>
      <p>These only appear on a Duo. They don't use the internet or any account. Every other iPhone and iPad gets the full club, just without the folding extras.</p>
    </>,
  },
  {
    id: "gamenight",
    q: "Can two kids play together?",
    a: <p>Yes. <b>Game Night</b> (in the Guess tab) is two players on one iPhone or iPad, guessing report cards head to head. Nothing is saved. If a TV is connected with AirPlay or a cable, it can show a big scoreboard.</p>,
  },
  {
    id: "links",
    q: "How do Moon Club links open the app?",
    a: <>
      <p>In newer versions of the app, links that start with <b>mutaafaziz.com/metaphases/kids/</b> open straight into Moon Club when it's installed. For example, <b>…/kids/school</b> opens Moon School, and <b>…/kids/guess</b>, <b>/piggy</b>, <b>/garden</b>, <b>/gamenight</b> and <b>/ask</b> open those parts.</p>
      <p>Family League links (<b>…/kids/league/…</b>) and lesson pack links (<b>…/kids/pack/…</b>) always ask the grown-up check first. If the app isn't installed, the same link opens the web page instead.</p>
    </>,
  },
  {
    id: "newphone",
    q: "We got a new phone. How do we bring progress over?",
    a: <>
      <p>Progress is kept <b>on the device</b>, not on our servers, so we can't restore it for you. There are two ways to move it:</p>
      <ul>
        <li><b>iCloud sync (best for a new phone).</b> In <b>For grown-ups → Your devices</b>, turn on <b>Sync with iCloud</b> on the old device and the new one, signed in to the same Apple account. Progress travels through your family's own iCloud, never through us. It's off until a grown-up turns it on.</li>
        <li><b>From the website.</b> On the website's grown-up corner, make a progress code. In the app, open <b>For grown-ups → From the website</b>, paste it and tap <b>Move my progress</b>.</li>
      </ul>
      <p>Without sync, a new phone starts fresh. Two kids sharing one Apple account would share progress.</p>
    </>,
  },
  {
    id: "delete",
    q: "Does deleting the app remove everything?",
    a: <>
      <p>Deleting the app removes its settings, widgets and saved answers. <b>Progress is kept in the iPhone's secure keychain</b>, which iOS keeps even after an app is deleted, so it can come back if you reinstall on the same device.</p>
      <p>To erase progress for good, use <b>For grown-ups → More → Reset all progress…</b> first, then delete the app. If iCloud sync was on, choose <b>Reset on all devices</b> or turn sync off.</p>
    </>,
  },
  {
    id: "time",
    q: "Is there anything to help with screen time?",
    a: <p>After about 20 minutes, Luna gets sleepy between games and offers <b>Goodnight, Luna</b>. There are no notifications pulling kids back. In <b>For grown-ups</b> you can also turn on <b>Relaxed play</b> (no speed ring), turn game sounds off, and limit Moon Garden planting.</p>,
  },
];

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; msg: string };

function ContactForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [device, setDevice] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const left = SUPPORT_MAX - message.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) { setStatus({ kind: "error", msg: "Please write your question (a few words is fine)." }); return; }
    setStatus({ kind: "sending" });
    try {
      const r = await fetch(`${BASE}/api/kids/support`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, email: email.trim() || null, device: device.trim() || null, website }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setStatus({ kind: "sent" }); return; }
      setStatus({ kind: "error", msg: d.error ?? "We couldn't send that just now. Please try again in a moment." });
    } catch {
      setStatus({ kind: "error", msg: "We couldn't reach our server. Check the connection and try again." });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="k-sent" role="status" data-testid="support-sent">
        <b>Thanks, your message is in. 🌙</b>
        <p>We usually reply within 2 days{email.trim() ? `, to ${email.trim()}` : ""}.{!email.trim() && " You didn't leave an email, so we can't write back, but we read every message."}</p>
        <button className="k-link" onClick={() => { setMessage(""); setEmail(""); setDevice(""); setStatus({ kind: "idle" }); }}>Send another message</button>
      </div>
    );
  }

  return (
    <form className="k-form" onSubmit={submit} noValidate aria-label="Contact us">
      <p className="k-note" role="note">Please don't include your child's name or other personal details.</p>
      <label className="k-field">
        <span>Your question</span>
        <textarea name="message" required maxLength={SUPPORT_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What can we help with?" aria-describedby="k-count" />
        <span id="k-count" className={`k-count${left < 100 ? " over" : ""}`} aria-live="polite">{left} characters left</span>
      </label>
      <label className="k-field">
        <span>Email for our reply <small>(optional)</small></span>
        <input type="email" name="email" autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="k-field">
        <span>Device and app version <small>(optional)</small></span>
        <input type="text" name="device" maxLength={120} value={device} onChange={(e) => setDevice(e.target.value)} placeholder="e.g. iPhone 15, iOS 18, Moon Club 0.13" />
      </label>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div className="k-hp" aria-hidden="true">
        <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      {status.kind === "error" && <p className="k-form-err" role="alert">{status.msg}</p>}
      <button className="k-btn k-btn-primary" type="submit" disabled={status.kind === "sending"}>{status.kind === "sending" ? "Sending…" : "Send message"}</button>
      <p className="k-small">We keep your message for up to 180 days, only to answer you. See the <Link to="/kids/privacy">privacy policy</Link>.</p>
    </form>
  );
}

export function SupportPage() {
  return (
    <div className="k-page k-support">
      <header className="k-hero">
        <div>
          <span className="k-eyebrow">For grown-ups</span>
          <h1>Moon Club <em>help &amp; support</em></h1>
        </div>
      </header>

      <section className="k-section">
        <p><b>Moon Club</b> is made by <b>Mutaaf Aziz</b>, an independent developer, alongside the <b>Metaphases Kids</b> website. Questions, problems or ideas? The answers below cover the common ones, and the form at the bottom reaches a real person.</p>
        <ul className="k-support-meta" aria-label="Works on">
          <li>📱 iPhone and iPad</li>
          <li>iOS / iPadOS 17 or later</li>
          <li>Free · no in-app purchases</li>
        </ul>
        <p className="k-small">Some extras need newer systems: Luna on the device needs Apple Intelligence (iOS 26 or later on a supported iPhone or iPad), and iPhone Duo features need iOS 27.1.</p>
        <div className="k-support-toc">
          <a className="k-btn k-btn-primary" href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}>Contact us</a>
          <button className="k-btn" onClick={() => navigate("/kids/privacy")}>Privacy policy</button>
        </div>
      </section>

      <section className="k-section" aria-labelledby="faq-h">
        <h2 id="faq-h">Common questions</h2>
        <div className="k-faq">
          {FAQ.map((f) => (
            <details key={f.id} id={`faq-${f.id}`}>
              <summary>{f.q}</summary>
              <div className="k-faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section className="k-section" id="contact" aria-labelledby="contact-h">
        <h2 id="contact-h">Contact us</h2>
        <p>Ask us anything about Moon Club or Metaphases Kids. You can also email <b data-testid="support-email">{PRIVACY_CONTACT}</b>.</p>
        <ContactForm />
      </section>

      <div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids")}>Back to the club</button></div>
    </div>
  );
}
