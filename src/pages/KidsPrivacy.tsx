// /kids/privacy: the privacy policy for the Moon Club app (iPhone/iPad) and the Metaphases Kids website.
// Apple App Review links here. Keep it TRUE: update it (and the date) whenever a data flow changes
// (AGENTS.md kids rules). Written for grown-ups, so plain text; no links out (the email is plain text).
import { href, navigate } from "../lib/router";

export const PRIVACY_EFFECTIVE = "November 4, 2026";
export const PRIVACY_CONTACT = "mutaaf@digitalcraftai.com";

export function PrivacyPage() {
  return (
    <div className="k-page k-privacy">
      <header className="k-hero"><div><span className="k-eyebrow">Effective {PRIVACY_EFFECTIVE}</span><h1>Privacy, <em>in plain words</em></h1></div></header>
      <section className="k-section">
        <p>This policy covers <b>Moon Club</b>, the app for iPhone and iPad, and the <b>Metaphases Kids</b> website (mutaafaziz.com/metaphases/kids). Both are made by Mutaaf Aziz, an individual developer ("we" below).</p>
      </section>
      <section className="k-section">
        <h2>The short version</h2>
        <ul className="k-list">
          <li>No accounts, no sign-up, and we never ask for names or email addresses.</li>
          <li>No ads, no analytics, no tracking, and no third-party SDKs.</li>
          <li>No in-app purchases. All money in the app is pretend.</li>
          <li>We don't sell or share any data. The only thing we keep is a message a grown-up chooses to send us through the support form.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>What stays on the device</h2>
        <ul className="k-list">
          <li><b>Progress.</b> Lessons, quests, badges, guesses, the pretend piggy bank and Family League players are saved on the device (on the website, in this browser). League players are emoji, not names.</li>
          <li><b>Widgets.</b> Home Screen widgets keep a small snapshot on the device, such as a streak or the pretend piggy bank total. They never hold anything a child typed.</li>
          <li><b>Luna's answers.</b> An answer may be kept on the device for up to 7 days so the same question loads fast.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Optional iCloud sync (app)</h2>
        <p>iCloud sync is off by default. Only a grown-up can turn it on, behind the grown-up check. Progress then syncs through your family's own iCloud key-value storage, which Apple keeps in your Apple account. We never receive it.</p>
      </section>
      <section className="k-section">
        <h2>When something leaves the device</h2>
        <ul className="k-list">
          <li><b>Market data.</b> The app and website download public prices, report dates and market mood from mutaafaziz.com. It's read-only, and nothing about your child is sent with it.</li>
          <li><b>Ask Luna on the device.</b> On iPhones and iPads with Apple Intelligence, Luna answers on the device and the question never leaves it.</li>
          <li><b>Ask Luna through our server.</b> Otherwise, the question text (up to 200 characters, with no name, account or device ID) goes to our server at mutaafaziz.com. The server passes it to Cloudflare Workers AI, which writes the answer right away. We don't store or log questions or answers. Luna tells kids not to type personal details, and we ask grown-ups to remind them too.</li>
          <li><b>Stopping abuse.</b> To keep the free helper from being overused, our server counts requests per scrambled (hashed) IP address for up to one hour. The IP address itself isn't stored.</li>
        </ul>
      </section>
      <section className="k-section" data-testid="privacy-support">
        <h2>When a grown-up writes to us</h2>
        <p>The <a href={href("/kids/support")} onClick={(e) => { e.preventDefault(); navigate("/kids/support"); }}>Help &amp; support</a> page has a contact form for grown-ups. It is the only place we keep anything you send. Emails to <b>support@mutaafaziz.com</b> go straight to Mutaaf's inbox and are only used to reply.</p>
        <ul className="k-list">
          <li><b>What we keep.</b> Your question, and only if you add them, a reply email and your device or app version, plus the time it arrived.</li>
          <li><b>How long.</b> Up to 180 days, then it's deleted automatically. We may delete it sooner, once we've replied.</li>
          <li><b>What it's for.</b> Only to answer you. We never use it for marketing, never share or sell it, and it isn't linked to your child's progress.</li>
          <li><b>Stopping abuse.</b> To stop spam, the form counts messages per scrambled (hashed) IP address for one hour. The IP address itself isn't stored.</li>
          <li>Please don't include your child's name or other personal details. To have a message deleted early, write to the address below.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>A grown-up's own AI key (beta and website only)</h2>
        <p>The App Store version of Moon Club does not offer these features.</p>
        <ul className="k-list">
          <li><b>Ask Luna on your own key (TestFlight beta app).</b> Behind the grown-up check, a grown-up can add their own key from Anthropic, OpenAI, Google or xAI. Nothing is sent until the grown-up turns on a consent switch that names that company. After that, your child's questions go from the device to that company, under the grown-up's account and that company's terms. The key stays in the device's Keychain. On the website, Ask Luna always uses the free helper above and never a grown-up's key.</li>
          <li><b>Read-aloud voice on your own key (website and beta app).</b> Behind the grown-up check, a grown-up can pick a voice from OpenAI or Google on their own key. Only app text and Luna's answers are read this way, never what your child types. On the website, the text passes through our server to that company; the key isn't stored or logged there.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Deleting data</h2>
        <ul className="k-list">
          <li>"Reset all progress" in the grown-ups corner erases progress on the device.</li>
          <li>Deleting the app removes its settings, widget snapshots and cached answers. Progress is kept in the device's secure keychain, which iOS keeps after an app is deleted, so it can return if the app is reinstalled. To erase it for good, use "Reset all progress" before deleting the app.</li>
          <li>The copy in your family's iCloud can be cleared by turning sync off or using Reset.</li>
          <li>On the website, clearing this site's data in your browser erases it too.</li>
        </ul>
      </section>
      <section className="k-section">
        <h2>Children's privacy</h2>
        <p>Moon Club and Metaphases Kids are made for kids about 8 to 12, learning with a grown-up. We don't knowingly collect personal information from children, in line with the U.S. Children's Online Privacy Protection Act (COPPA). Settings, sharing and anything that leaves kids mode sit behind a grown-up check. Parents can contact us at any time with questions or to ask about any data.</p>
      </section>
      <section className="k-section">
        <h2>Changes to this policy</h2>
        <p>If we change how anything works, we'll update this page and the date at the top.</p>
      </section>
      <section className="k-section">
        <h2>Contact</h2>
        <p>Mutaaf Aziz · <b data-testid="privacy-contact">{PRIVACY_CONTACT}</b></p>
        <p>Or use the form on the <a href={href("/kids/support")} onClick={(e) => { e.preventDefault(); navigate("/kids/support"); }}>Help &amp; support</a> page.</p>
      </section>
      <div className="k-nav"><button className="k-btn" onClick={() => navigate("/kids")}>Back to the club</button></div>
    </div>
  );
}
