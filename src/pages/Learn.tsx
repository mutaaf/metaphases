import { useEffect } from "react";
import { GLOSSARY } from "../lib/glossary";
import { navigate } from "../lib/router";
import { Phase, PHASE_LABEL } from "../components/bits";
import { askTheCalendar, PageHero } from "../components/Hero";

/** Scroll to a glossary entry and pulse it. */
export function focusTerm(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  el.focus({ preventScroll: true });
}

export default function LearnPage() {
  useEffect(() => {
    document.title = "Learn the language of earnings · Metaphases";
    const h = location.hash.slice(1);
    if (h) setTimeout(() => focusTerm(h), 80);
  }, []);
  return (
    <div className="page">
      <PageHero
        eyebrow={`Learn · ${Object.keys(GLOSSARY).length} terms, plain English`}
        title={<>Learn the <em>language</em>.</>}
        dek="Every dotted term on Metaphases opens one of these. No jargon left unexplained, and no advice: just what the numbers mean."
        primary={{ label: "Start with EPS", onClick: () => focusTerm("eps"), icon: "right" }}
        secondary={{ label: "Ask a question instead", onClick: () => askTheCalendar("ask") }}
      />
      <div className="glossary">
        <section className="card phases-key">
          <h4 className="eyebrow">Why moons?</h4>
          <p>Earnings arrive in a cycle (every company, every quarter), like the moon. We draw report timing as a phase:</p>
          <ul>
            {(["bmo", "dmh", "amc", ""] as const).map((h) => <li key={h}><Phase h={h} size={22} /><b>{PHASE_LABEL[h]}</b><span className="muted">{h ? GLOSSARY[h].def : "The company hasn't confirmed its time yet."}</span></li>)}
          </ul>
          <button className="link small" onClick={() => navigate("/about")}>Where Metaphases comes from →</button>
        </section>
        {Object.entries(GLOSSARY).map(([k, g]) => (
          <article key={k} id={k} tabIndex={-1} className="gl-item"><h3>{g.term}</h3><p>{g.def}</p>{g.eg && <p className="term-eg">{g.eg}</p>}</article>
        ))}
      </div>
    </div>
  );
}
