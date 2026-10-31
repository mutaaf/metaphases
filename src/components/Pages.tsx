import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsEvent } from "../../shared/types";
import { useCalendar, useTicker } from "../lib/api";
import { co, ETFS, ETF_ASOF, heldVia, nameOf, resultOf, surprise, UNIVERSE } from "../lib/data";
import { addDays, daysBetween, fmtLong, fmtShort, MONTHS, parse, todayISO, weekOf } from "../lib/dates";
import { eps, money, pct } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import { navigate, setParam } from "../lib/router";
import { actions, useStore, type Holding } from "../lib/store";
import { GradeBadge, Icon, Notice, Phase, PHASE_LABEL, Skeleton, Term, Tile } from "./bits";
import { EventRow } from "./Calendar";

// ── Watchlist ──────────────────────────────────────────────────────────
function WatchRow({ s, buy, note }: { s: string; buy?: number; note?: string }) {
  const { data, loading } = useTicker(s);
  const today = todayISO();
  const n = data?.next ? daysBetween(today, data.next.date) : null;
  const below = buy && data?.quote ? data.quote.price <= buy : false;
  return (
    <button className={`wl-row ${below ? "alert" : ""}`} onClick={() => setParam("t", s)}>
      <Tile s={s} size={44} />
      <span className="wl-id"><b>{s}</b><span className="muted">{data?.profile?.name ?? nameOf(s)}</span>{note && <span className="wl-note">“{note}”</span>}</span>
      <span className="wl-next">
        {loading && !data ? <Skeleton w={90} /> : data?.next ? (
          <><Phase h={data.next.session} size={14} /> <span><b>{fmtShort(data.next.date)}</b><span className="eyebrow">{n === 0 ? "today" : `in ${n}d`}</span></span></>
        ) : <span className="muted small">No date yet</span>}
      </span>
      <span className="wl-num"><span className="eyebrow">Price</span>{data?.quote ? `$${data.quote.price.toFixed(2)}` : "—"}</span>
      <span className="wl-num"><span className="eyebrow">Buy below</span>{buy ? `$${buy.toFixed(2)}` : "—"}</span>
      <span className="wl-grades"><GradeBadge g={data?.setup.grade ?? null} size="sm" /><GradeBadge g={data?.compass.grade ?? null} size="sm" /></span>
    </button>
  );
}

export function WatchlistPage({ onSearch }: { onSearch: () => void }) {
  const { watch } = useStore();
  useEffect(() => { document.title = "Your watchlist, in phases · Metaphases"; }, []);
  return (
    <div className="page">
      <h1 className="headline">Your <em>watchlist</em>.</h1>
      <p className="dek">Every name you're tracking, when it reports next, and whether it's under your buy price. Grades: <Term k="setup">setup</Term> · <Term k="compass">Compass</Term>.</p>
      <div className="wl">
        {watch.length === 0 && <p className="empty-big">Nothing here yet. Star a company from the calendar or <button className="link" onClick={onSearch}>search for one</button>.</p>}
        {watch.map((w) => <WatchRow key={w.s} s={w.s} buy={w.buy} note={w.note} />)}
      </div>
      <button className="btn btn-box" onClick={onSearch}><Icon name="plus" size={14} /> Add a ticker</button>
    </div>
  );
}

// ── Compass: your money vs. the earnings calendar ──────────────────────
function parseHoldings(text: string): Holding[] {
  const out: Holding[] = [];
  for (const line of text.split(/\n|;/)) {
    const m = line.trim().toUpperCase().match(/^([A-Z.\-]{1,6})[\s,:=$]+\$?([\d,]+(?:\.\d+)?)\s*(K)?/);
    if (m) out.push({ s: m[1], v: parseFloat(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1) });
  }
  return out;
}

export function CompassPage() {
  const { holdings } = useStore();
  const [text, setText] = useState(holdings.map((h) => `${h.s} ${h.v}`).join("\n"));
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

  return (
    <div className="page">
      <h1 className="headline">Your money, <em>in phases</em>.</h1>
      <p className="dek">Paste what you own — stocks or funds — and Compass shows which reports actually move your money over the next two months, <Term k="lookthrough">looking through</Term> your funds to the companies inside.</p>
      <div className="compass">
        <section className="card">
          <h4 className="eyebrow">Your holdings · one per line, ticker and dollar value</h4>
          <textarea className="holdings-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"VOO 25000\nQQQ 12k\nAAPL 4,000\nSCHD 8000"} />
          <div className="row gap">
            <button className="btn btn-box on" onClick={() => actions.setHoldings(parseHoldings(text))}>Map my exposure</button>
            <button className="btn btn-ghost" onClick={() => { const t = "VOO 25000\nQQQ 12000\nSCHD 8000\nAAPL 4000\nNVDA 3000"; setText(t); actions.setHoldings(parseHoldings(t)); }}>Try a sample portfolio</button>
          </div>
          <p className="muted small">Saved only in this browser. Funds we can see inside: {Object.keys(ETFS).sort().join(", ")} (top 10 holdings as of {ETF_ASOF}).</p>
        </section>

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

// ── Retrace: grading the month after the fact ──────────────────────────
export function RetracePage() {
  const today = todayISO();
  const t = parse(today);
  const [offset, setOffset] = useState(0);
  const m = new Date(t.getFullYear(), t.getMonth() - offset, 1);
  const from = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const { data, loading, error } = useCalendar(from, to < today ? to : today);
  useEffect(() => { document.title = "Retrace: how the reports really landed · Metaphases"; }, []);

  const done = (data?.events ?? []).filter((e) => e.eA != null && e.t);
  const by = (k: string) => done.filter((e) => resultOf(e) === k).length;
  const epsBeat = done.filter((e) => e.eE != null && (e.eA as number) >= e.eE).length;
  const revJudged = done.filter((e) => e.rA != null && e.rE != null);
  const revBeat = revJudged.filter((e) => (e.rA as number) >= (e.rE as number)).length;
  const sur = done.map(surprise).filter((x): x is number => x != null && Math.abs(x) < 500);
  const median = sur.length ? [...sur].sort((a, b) => a - b)[Math.floor(sur.length / 2)] : null;
  const sectors = useMemo(() => {
    const s: Record<string, { n: number; beat: number; surprises: number[]; med: number }> = {};
    for (const e of done) { const k = co(e.s)?.sec || "Other"; (s[k] ??= { n: 0, beat: 0, surprises: [], med: 0 }); s[k].n++; if (resultOf(e) === "beat") s[k].beat++; const x = surprise(e); if (x != null) s[k].surprises.push(x); }
    for (const v of Object.values(s)) { const xs = v.surprises.sort((a, b) => a - b); v.med = xs.length ? xs[Math.floor(xs.length / 2)] : 0; }
    return Object.entries(s).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].beat / b[1].n - a[1].beat / a[1].n);
  }, [data]);
  const ranked = [...done].filter((e) => surprise(e) != null && Math.abs(surprise(e)!) < 500).sort((a, b) => surprise(b)! - surprise(a)!);

  return (
    <div className="page">
      <h1 className="headline"><em>Retrace</em> {MONTHS[m.getMonth()]}.</h1>
      <p className="dek">Market Digest grades its own picks against what really happened. Retrace does the same for Wall Street: every report this month, scored against its <Term k="consensus">consensus</Term>.</p>
      <div className="row gap">
        <button className="btn btn-box sq" onClick={() => setOffset(offset + 1)} aria-label="Previous month"><Icon name="left" /></button>
        <span className="btn btn-box on label">{MONTHS[m.getMonth()]} {m.getFullYear()}</span>
        <button className="btn btn-box sq" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 1))} aria-label="Next month"><Icon name="right" /></button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {offset > 1 && !loading && !done.length && <Notice>Our free data window only reaches back about a month — older results will appear as the archive grows.</Notice>}
      {loading ? <Skeleton h={200} /> : done.length === 0 ? (
        <p className="empty-big">No tracked results yet this month — the first reports land soon.</p>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><span className="eyebrow">Reported</span><b>{done.length}</b></div>
            <div className="stat"><span className="eyebrow"><Term k="eps">EPS</Term> beat rate</span><b>{Math.round((epsBeat / done.length) * 100)}%</b></div>
            <div className="stat"><span className="eyebrow"><Term k="revenue">Revenue</Term> beat rate</span><b>{revJudged.length ? `${Math.round((revBeat / revJudged.length) * 100)}%` : "—"}</b></div>
            <div className="stat"><span className="eyebrow">Median <Term k="surprise">surprise</Term></span><b>{pct(median)}</b></div>
          </div>
          <section className="card">
            <h4 className="eyebrow">The month in one bar</h4>
            <div className="big-strip">
              <span className="res-beat" style={{ flex: by("beat") }}>{by("beat")} beat</span>
              <span className="res-mixed" style={{ flex: by("mixed") }}>{by("mixed")} mixed</span>
              <span className="res-miss" style={{ flex: by("miss") }}>{by("miss")} miss</span>
            </div>
            <p className="muted small">Analysts set the bar low on purpose — historically about three in four companies beat on EPS. The interesting signal is who <i>doesn't</i>.</p>
          </section>
          <div className="two-col">
            <section className="card">
              <h4 className="eyebrow">By sector</h4>
              <table className="rx-table">
                <thead><tr><th>Sector</th><th>Reports</th><th>Beat both</th><th>Median surprise</th></tr></thead>
                <tbody>{sectors.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.n}</td><td>{Math.round((v.beat / v.n) * 100)}%</td><td className={v.med >= 0 ? "pos" : "neg"}>{pct(v.med)}</td></tr>)}</tbody>
              </table>
            </section>
            <section className="card">
              <h4 className="eyebrow">Biggest beats</h4>
              {ranked.slice(0, 6).map((e) => <EventRow key={e.s} e={e} showDate />)}
              <h4 className="eyebrow" style={{ marginTop: 20 }}>Biggest misses</h4>
              {ranked.slice(-6).reverse().map((e) => <EventRow key={e.s} e={e} showDate />)}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// ── Learn ──────────────────────────────────────────────────────────────
export function LearnPage() {
  useEffect(() => { document.title = "Learn the language of earnings · Metaphases"; }, []);
  return (
    <div className="page">
      <h1 className="headline">Learn the <em>language</em>.</h1>
      <p className="dek">Every dotted term on Metaphases opens one of these. Plain English, no jargon left unexplained.</p>
      <div className="glossary">
        <section className="card phases-key">
          <h4 className="eyebrow">Why moons?</h4>
          <p>Earnings arrive in a cycle — every company, every quarter, like the moon. We draw report timing as a phase:</p>
          <ul>
            {(["bmo", "dmh", "amc", ""] as const).map((h) => <li key={h}><Phase h={h} size={22} /><b>{PHASE_LABEL[h]}</b><span className="muted">{h ? GLOSSARY[h].def : "The company hasn't confirmed its time yet."}</span></li>)}
          </ul>
        </section>
        {Object.entries(GLOSSARY).map(([k, g]) => (
          <article key={k} id={k} className="gl-item"><h3>{g.term}</h3><p>{g.def}</p>{g.eg && <p className="term-eg">{g.eg}</p>}</article>
        ))}
      </div>
    </div>
  );
}

// ── ⌘K search ──────────────────────────────────────────────────────────
export function Search({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const { watch } = useStore();
  useEffect(() => { ref.current?.focus(); }, []);
  const results = useMemo(() => {
    const Q = q.trim().toUpperCase();
    if (!Q) return Object.entries(UNIVERSE).sort((a, b) => b[1].mc - a[1].mc).slice(0, 8).map(([s]) => s);
    const all = Object.entries(UNIVERSE);
    const exact = all.filter(([s]) => s === Q).map(([s]) => s);
    const starts = all.filter(([s]) => s.startsWith(Q) && s !== Q).sort((a, b) => b[1].mc - a[1].mc).map(([s]) => s);
    const name = all.filter(([s, c]) => !s.startsWith(Q) && c.n.toUpperCase().includes(Q)).sort((a, b) => b[1].mc - a[1].mc).map(([s]) => s);
    const r = [...exact, ...starts, ...name].slice(0, 10);
    return r.length || !/^[A-Z.\-]{1,6}$/.test(Q) ? r : [Q];
  }, [q]);
  const pick = (s: string) => { onClose(); setParam("t", s); };
  return (
    <div className="drawer-scrim center" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search tickers">
        <div className="pal-input"><Icon name="search" /><input ref={ref} value={q} placeholder="Search a ticker or company…" onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(results.length - 1, i + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); } else if (e.key === "Enter" && results[i]) pick(results[i]); else if (e.key === "Escape") onClose(); }} /><kbd>esc</kbd></div>
        <ul>
          {results.map((s, k) => {
            const c = UNIVERSE[s];
            const on = watch.some((w) => w.s === s);
            return (
              <li key={s} className={k === i ? "on" : ""} onMouseEnter={() => setI(k)}>
                <button className="pal-row" onClick={() => pick(s)}><Tile s={s} size={30} /><b>{s}</b><span className="muted">{c?.n ?? "Look up this ticker"}</span></button>
                <button className={`icon-btn ${on ? "starred" : ""}`} onClick={() => actions.toggleWatch(s)} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} title={on ? "On your watchlist" : "Add to watchlist"}><Icon name="star" size={14} /></button>
              </li>
            );
          })}
        </ul>
        <div className="pal-foot eyebrow">↑↓ to move · enter to open · ★ to watch</div>
      </div>
    </div>
  );
}

