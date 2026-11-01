import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsEvent } from "../../shared/types";
import { useCalendar } from "../lib/api";
import { ETFS, ETF_ASOF, heldVia, nameOf } from "../lib/data";
import { addDays, fmtShort, todayISO, weekOf } from "../lib/dates";
import { money } from "../lib/format";
import { setParam } from "../lib/router";
import { actions, useStore, type Holding } from "../lib/store";
import { Phase, Skeleton, Term, Tile } from "../components/bits";
import { PageHero } from "../components/Hero";

const SAMPLE = "VOO 25000\nQQQ 12000\nSCHD 8000\nAAPL 4000\nNVDA 3000";

export function parseHoldings(text: string): Holding[] {
  const out: Holding[] = [];
  for (const line of text.split(/\n|;/)) {
    const m = line.trim().toUpperCase().match(/^([A-Z.\-]{1,6})[\s,:=$]+\$?([\d,]+(?:\.\d+)?)\s*(K)?/);
    if (m) out.push({ s: m[1], v: parseFloat(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1) });
  }
  return out;
}

export default function CompassPage() {
  const { holdings } = useStore();
  const [text, setText] = useState(holdings.map((h) => `${h.s} ${h.v}`).join("\n"));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = todayISO();
  const from = weekOf(today)[0];
  const to = addDays(from, 7 * 9 - 3);
  const { data, loading } = useCalendar(from, to);
  useEffect(() => { document.title = "Compass: what reports with your money · Metaphases"; }, []);

  const total = holdings.reduce((a, h) => a + h.v, 0);
  const exposure = useMemo(() => {
    const rows: { e: EarningsEvent; dollars: number; via: string[] }[] = [];
    for (const e of data?.events ?? []) {
      if (e.d < today) continue;
      const direct = holdings.find((h) => h.s === e.s);
      const v = heldVia(e.s, holdings);
      const dollars = (direct?.v ?? 0) + v.reduce((a, x) => a + x.dollars, 0);
      if (dollars > 0) rows.push({ e, dollars, via: [...(direct ? ["direct"] : []), ...v.map((x) => x.etf)] });
    }
    return rows.sort((a, b) => a.e.d.localeCompare(b.e.d));
  }, [data, holdings]);
  const weeks = useMemo(() => {
    const w: Record<string, { dollars: number; names: string[] }> = {};
    for (const r of exposure) { const k = weekOf(r.e.d)[0]; (w[k] ??= { dollars: 0, names: [] }); w[k].dollars += r.dollars; w[k].names.push(r.e.s); }
    return Object.entries(w).sort();
  }, [exposure]);
  const maxW = Math.max(1, ...weeks.map(([, v]) => v.dollars));
  const reporting = exposure.reduce((a, r) => a + r.dollars, 0);
  const trySample = () => { setText(SAMPLE); actions.setHoldings(parseHoldings(SAMPLE)); };
  const pasteYours = () => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); };

  return (
    <div className="page">
      <PageHero
        eyebrow="Compass · your exposure"
        title={<>Your money, <em>in phases</em>.</>}
        dek={<>Paste what you own (stocks or funds) and Compass shows which reports actually move your money over the next two months, <Term k="lookthrough">looking through</Term> your funds to the companies inside.</>}
        primary={holdings.length ? { label: "Paste a new portfolio", onClick: pasteYours } : { label: "Try a sample portfolio", onClick: trySample }}
        secondary={holdings.length ? { label: "Try the sample instead", onClick: trySample } : { label: "Paste yours", onClick: pasteYours }}
      />
      <div className="compass">
        <section className="card">
          <h4 className="eyebrow">Your holdings · one per line, ticker and dollar value</h4>
          <label className="sr-only" htmlFor="holdings-input">Your holdings</label>
          <textarea id="holdings-input" ref={inputRef} className="holdings-input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"VOO 25000\nQQQ 12k\nAAPL 4,000\nSCHD 8000"} />
          <div className="row gap">
            <button className="cta cta-primary" onClick={() => actions.setHoldings(parseHoldings(text))}>Map my exposure</button>
            {holdings.length > 0 && <button className="cta cta-ghost" onClick={() => { setText(""); actions.setHoldings([]); }}>Clear</button>}
          </div>
          <p className="muted small">Saved only in this browser. Funds we can see inside: {Object.keys(ETFS).sort().join(", ")} (top 10 holdings as of {ETF_ASOF}).</p>
        </section>

        {holdings.length === 0 && (
          <section className="empty-cta quiet" aria-label="What Compass shows you">
            <span className="empty-moon"><Phase h="bmo" size={40} /></span>
            <h2>See your portfolio's earnings season.</h2>
            <p className="muted">Paste a few lines like <code>VOO 25000</code>. Funds count: we look inside them for you.</p>
            <ul className="preview-list">
              <li><b>Money riding on reports</b><span className="muted">how much of your portfolio reports in the next two months</span></li>
              <li><b>Week by week</b><span className="muted">which weeks matter most to you</span></li>
              <li><b>Every report that touches you</b><span className="muted">direct holdings plus the companies inside your funds</span></li>
            </ul>
          </section>
        )}

        {holdings.length > 0 && (
          <>
            <div className="stat-row">
              <div className="stat"><span className="eyebrow">Portfolio</span><b>{money(total)}</b></div>
              <div className="stat"><span className="eyebrow">Reports touching it</span><b>{exposure.length}</b></div>
              <div className="stat"><span className="eyebrow">Money riding on reports</span><b>{money(reporting)}</b><span className="muted small">{total ? `${((reporting / total) * 100).toFixed(0)}% of your portfolio` : ""}</span></div>
            </div>
            <section className="card">
              <h4 className="eyebrow">Week by week</h4>
              {loading && <Skeleton h={120} />}
              <div className="wk-bars">
                {weeks.map(([wk, v]) => (
                  <div key={wk} className="wk-bar">
                    <span className="wk-fill" style={{ height: `${(v.dollars / maxW) * 100}%` }} />
                    <b>{money(v.dollars)}</b>
                    <span className="eyebrow">{fmtShort(wk)}</span>
                    <span className="wk-names">{v.names.slice(0, 3).join(" · ")}{v.names.length > 3 ? ` +${v.names.length - 3}` : ""}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <h4 className="eyebrow">Every report that touches your money</h4>
              {exposure.map(({ e, dollars, via }) => (
                <button key={e.s + e.d} className="ex-row" onClick={() => setParam("t", e.s)}>
                  <span className="ex-date">{fmtShort(e.d)} <Phase h={e.h} size={11} /></span>
                  <Tile s={e.s} size={30} />
                  <span className="erow-id"><b>{e.s}</b><span className="muted">{nameOf(e.s)}</span></span>
                  <span className="ex-via muted small">{via.join(" + ")}</span>
                  <b className="ex-amt">{money(dollars)}</b>
                </button>
              ))}
              {!loading && !exposure.length && <p className="muted">None of your holdings report in the next two months.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
