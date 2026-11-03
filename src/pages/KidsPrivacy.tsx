// /kids/privacy: the plain-language privacy policy for Metaphases Kids (website) and the Moon Club app.
// Keep it TRUE: update it whenever a data flow changes (AGENTS.md kids rules).
import { navigate } from "../lib/router";

export function PrivacyPage() {
  return (
    <div className="k-page k-privacy">
      <header className="k-hero"><div><span className="k-eyebrow">Updated November 2, 2026</span><h1>Privacy, <em>in plain words</em></h1></div></header>
      <section className="k-section">
        <h2>The short version</h2>
        <p>Metaphases Kids (this website) and the Moon Club app for iPhone and iPad don't collect personal information about your child. They have no accounts, no ads, no analytics and no tracking, and we never sell anything to anyone.</p>
      </section>
      <section className="k-section">
        <h2>What stays on your device</h2>
        <ul className="k-list">
          <li>Progress (lessons, quests, badges, guesses, the pretend piggy bank, Family League players) is saved only in this browser or on the device.</li>
          <li>Family League players are emoji, not names. League and progress codes hold only companies, dates, picks and lesson progress.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>When something leaves the device</h2>
        <ul className="k-list">
          <li><b>Market data.</b> The app and website download public prices, report dates and market mood from mutaafaziz.com. These requests carry nothing about your child.</li>
          <li><b>Ask Luna, free mode.</b> A typed question is sent to our server to get an answer from a kid-safe AI model, with no name or account attached. We don't store questions. Our hosting provider (Cloudflare) processes the request, and basic request logs and rate limits may apply.</li>
          <li><b>Ask Luna, on-device mode (app).</b> With Apple Intelligence, questions are answered on the iPhone or iPad and never leave it.</li>
          <li><b>Ask Luna or the voice with a grown-up's own key.</b> A grown-up can choose to use their own AI account (Anthropic, OpenAI, Google or xAI). Before any of your child's questions are sent, the grown-up has to turn on a consent switch that names the company. Questions then go straight from the device to that company under the grown-up's account and their terms. The key is stored in the device's Keychain (in the browser on the website), never on our servers.</li>
          <li><b>iCloud sync (app, optional).</b> If a grown-up turns it on, progress syncs through your family's own iCloud account. We can't see it.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Grown-ups are in charge</h2>
        <ul className="k-list">
          <li>Settings, sharing and anything that leaves kids mode sit behind a grown-up check.</li>
          <li>You can erase all progress at any time in the grown-up corner.</li>
          <li>Nothing here is investment advice, and all money in the app is pretend.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Questions</h2>
        <p>Email Mutaaf Aziz at mutaaf.aziz@gmail.com.</p>
      </section>
      <div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids")}>Back to the club</button></div>
    </div>
  );
}
