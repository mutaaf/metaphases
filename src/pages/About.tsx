import { useEffect } from "react";
import { navigate } from "../lib/router";
import { Mark, Phase } from "../components/bits";
import { PageHero, seeThisWeek } from "../components/Hero";

const LINEAGE: { from: string; what: string; here: string }[] = [
  { from: "Market Digest", what: "Swing and day-trade scorers", here: "The setup grade: trend, momentum, 52-week range, volatility and track record, with the same A+ to F scale." },
  { from: "Market Digest", what: "Sentiment scoring", here: "Market Mood: a fear-to-greed gauge from six signals you can inspect." },
  { from: "Market Digest", what: "Retrace pick grading", here: "Retrace: every report graded against consensus after the fact." },
  { from: "Compass", what: "Fundamentals quality grade", here: "Compass quality: valuation, profitability, growth and health, each with its inputs shown." },
  { from: "Compass", what: "Portfolio overlap", here: "Look-through: which reports move your money, even inside your funds." },
  { from: "Compass", what: "Plain-English glossary", here: "Every dotted term opens a definition. No jargon left unexplained." },
];

const SOURCES: [string, string][] = [
  ["Finnhub", "Earnings calendar, estimates and actuals, fundamentals, analyst ratings, quotes"],
  ["Nasdaq", "Past report dates for reaction history"],
  ["Yahoo Finance", "Daily prices for setup grades, reactions and Market Mood"],
  ["FRED (St. Louis Fed)", "Economic release calendar: jobs, CPI, PCE, GDP, retail sales"],
];

export default function AboutPage() {
  useEffect(() => { document.title = "Where Metaphases comes from · Metaphases"; }, []);
  return (
    <div className="page about">
      <PageHero
        eyebrow="About · where this comes from"
        title={<>A calmer earnings calendar, <em>with a memory</em>.</>}
        dek="Metaphases is the public face of two private tools: Market Digest, an automated pre-market brief, and Compass, a family investing advisor. Their best ideas are here, free, in plain English."
        primary={{ label: "See this week", onClick: () => { navigate("/"); setTimeout(seeThisWeek, 120); }, icon: "right" }}
        secondary={{ label: "Learn the language", onClick: () => navigate("/learn") }}
        aside={<span className="about-mark"><Mark size={120} /></span>}
      />

      <section className="card">
        <h4 className="eyebrow">The lineage</h4>
        <ul className="lineage">
          {LINEAGE.map((l) => (
            <li key={l.here}>
              <span className={`lin-from lin-${l.from === "Compass" ? "compass" : "digest"}`}>{l.from}</span>
              <span className="lin-what muted">{l.what}</span>
              <span className="lin-here">{l.here}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col even">
        <section className="card stance">
          <h4 className="eyebrow">Explained, never advice</h4>
          <p>Every grade is a rule you can read: open any factor and you'll see its inputs. Metaphases never says buy or sell, never sets a price target and never invents a confidence score. When a source doesn't have a number, you'll see "—" and a reason.</p>
          <p className="muted small">Nothing here is investment advice. Do your own homework.</p>
        </section>
        <section className="card">
          <h4 className="eyebrow">Bring your own key</h4>
          <p>The AI features run on a free built-in model, or on your own Anthropic, OpenAI, Google Gemini or xAI key: tap the AI button in the top bar. The key stays in your browser and is sent only with your request, never stored on our side.</p>
        </section>
      </div>

      <section className="card kids-promo">
        <h4 className="eyebrow">Metaphases Kids</h4>
        <p>The Market Moon Club teaches kids how the market works with <b>pretend money that follows real prices</b>: guess company report cards, build a pretend piggy bank, take short Moon School lessons, and ask Luna, a kid-safe helper. No real money, no ads, no accounts, nothing collected, no links out.</p>
        <button className="cta cta-secondary" onClick={() => navigate("/kids")}>Open Metaphases Kids</button>
      </section>

      <section className="card">
        <h4 className="eyebrow">Data, and how fresh it is</h4>
        <dl className="sources">
          {SOURCES.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="muted small">Calendars refresh every 30 minutes, prices hourly, and the ticker universe (~630 companies) and fund holdings weekly. Everything runs on free tiers with no accounts and no trackers.</p>
      </section>

      <section className="card built">
        <h4 className="eyebrow">Built in the open, kept up by agents</h4>
        <p>A small crew of autonomous agents keeps Metaphases running. A scout files ideas and checks dates against company announcements, a builder ships them test-first, a critic reviews the live site and a keeper keeps it healthy. Every change is a reviewed pull request.</p>
        <div className="row gap">
          <a className="cta cta-secondary" href="https://github.com/mutaaf/metaphases" target="_blank" rel="noreferrer">Read the source</a>
          <a className="cta cta-ghost" href="https://mutaafaziz.com" target="_blank" rel="noreferrer">More from Mutaaf Aziz</a>
        </div>
      </section>

      <p className="about-sign"><Phase h="dmh" size={14} /> Charted in Texas · every company, every quarter.</p>
    </div>
  );
}
