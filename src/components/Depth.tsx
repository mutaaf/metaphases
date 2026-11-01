// Data-depth surfaces for the ticker sheet, Retrace and the macro strip:
// price chart with earnings markers, peers reporting nearby, quarterly trend, .ics buttons, season scoreboard.
import { useMemo, useState } from "react";
import type { Quarter, Reaction, TickerResponse } from "../../shared/types";
import { nyDate, peersFor, placeMarkers, seasonScore } from "../../shared/depth";
import { useCalendar, prefetchTicker } from "../lib/api";
import { co, UNIVERSE } from "../lib/data";
import { addDays, fmtShort, todayISO } from "../lib/dates";
import { eps, money, pct } from "../lib/format";
import { BASE, setParam } from "../lib/router";
import { Icon, Phase, PHASE_LABEL, Skeleton, Term, Tile } from "./bits";

// ── Price chart with earnings markers ──────────────────────────────────
export function PriceChart({ data }: { data: TickerResponse }) {
  const ch = data.chart;
  const [sel, setSel] = useState<number | null>(null);
  const W = 680, H = 220, PADL = 8, PADR = data.next ? 64 : 8, PADT = 14, PADB = 22;
  const g = useMemo(() => {
    if (!ch || ch.c.length < 2) return null;
    const all = [...ch.c, ...ch.s50.filter((x): x is number => x != null), ...ch.s200.filter((x): x is number => x != null)];
    const last = ch.c[ch.c.length - 1];
    const band = data.expectedMove != null ? (last * data.expectedMove) / 100 : 0;
    let lo = Math.min(...all, last - band), hi = Math.max(...all, last + band);
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const x = (i: number) => PADL + (i / (ch.c.length - 1)) * (W - PADL - PADR);
    const y = (v: number) => PADT + (1 - (v - lo) / (hi - lo)) * (H - PADT - PADB);
    const path = (vs: (number | null)[]) => vs.reduce((d, v, i) => (v == null ? d : d + `${d && vs[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`), "");
    const markers = placeMarkers(ch.t, data.history);
    const months: { i: number; label: string }[] = [];
    ch.t.forEach((t, i) => { const d = nyDate(t); if (i > 0 && d.slice(5, 7) !== nyDate(ch.t[i - 1]).slice(5, 7)) months.push({ i, label: new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short" }) }); });
    return { x, y, last, band, close: path(ch.c), s50: path(ch.s50), s200: path(ch.s200), markers, months, up: last >= ch.c[0] };
  }, [ch, data.history, data.expectedMove]);

  if (!ch || !g) return <p className="muted small">Price history unavailable right now.</p>;
  const m = sel != null ? g.markers[sel] : null;
  const endX = W - PADR;
  return (
    <div className="pchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`One year of ${data.symbol} prices with ${g.markers.length} earnings reports marked`}>
        {g.months.map((mo) => (
          <g key={mo.i}><line x1={g.x(mo.i)} x2={g.x(mo.i)} y1={PADT} y2={H - PADB} className="pc-grid" /><text x={g.x(mo.i) + 3} y={H - 6} className="pc-month">{mo.label}</text></g>
        ))}
        {data.next && g.band > 0 && (
          <g className="pc-proj">
            <rect x={endX + 6} width={PADR - 14} y={g.y(g.last + g.band)} height={g.y(g.last - g.band) - g.y(g.last + g.band)} rx="3" />
            <text x={endX + PADR / 2 - 1} y={g.y(g.last + g.band) - 4} textAnchor="middle">±{data.expectedMove!.toFixed(1)}%</text>
            <text x={endX + PADR / 2 - 1} y={g.y(g.last - g.band) + 12} textAnchor="middle">{fmtShort(data.next.date)}</text>
          </g>
        )}
        <path d={g.s200} className="pc-s200" />
        <path d={g.s50} className="pc-s50" />
        <path d={g.close} className={`pc-close ${g.up ? "up" : "down"}`} />
        {g.markers.map((mk, k) => {
          const beat = mk.r.epsA != null && mk.r.epsE != null ? mk.r.epsA >= mk.r.epsE : null;
          const cx = g.x(mk.i), cy = g.y(ch.c[mk.i]);
          return (
            <g key={mk.r.date} className={`pc-mark ${beat == null ? "" : beat ? "beat" : "miss"} ${sel === k ? "on" : ""}`} onClick={() => setSel(sel === k ? null : k)} role="button" tabIndex={0} aria-label={`Report ${mk.r.date}`} onKeyDown={(e) => e.key === "Enter" && setSel(sel === k ? null : k)}>
              <line x1={cx} x2={cx} y1={PADT} y2={H - PADB} />
              <circle cx={cx} cy={cy} r="7" />
              <path d={`M${cx} ${cy - 5}a5 5 0 0 1 0 10a2.6 5 0 0 0 0-10z`} />
            </g>
          );
        })}
      </svg>
      <div className="pc-legend">
        <span><i className="lg-close" /> Price</span><span><i className="lg-s50" /> <Term k="sma">50-day</Term></span><span><i className="lg-s200" /> 200-day</span>
        <span><i className="lg-mark" /> Report (tap)</span>
        {data.next && g.band > 0 && <span><i className="lg-band" /> <Term k="expectedmove">Typical move</Term> into {fmtShort(data.next.date)}</span>}
      </div>
      {m && <MarkerDetail r={m.r} />}
    </div>
  );
}

function MarkerDetail({ r }: { r: Reaction }) {
  const beat = r.epsA != null && r.epsE != null ? r.epsA >= r.epsE : null;
  return (
    <div className={`pc-detail ${beat == null ? "" : beat ? "res-beat" : "res-miss"}`}>
      <Phase h={r.session} size={14} />
      <b>{r.period}</b>
      <span>reported {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      <span>EPS {eps(r.epsE)} → <b>{eps(r.epsA)}</b> ({pct(r.surprisePct)})</span>
      <span>Stock {r.move == null ? "—" : <b className={r.move >= 0 ? "pos" : "neg"}>{pct(r.move)}</b>} across the report</span>
    </div>
  );
}

// ── Peers reporting nearby (read-through) ──────────────────────────────
export function Peers({ symbol, date }: { symbol: string; date: string }) {
  const { data, loading } = useCalendar(addDays(date, -7), addDays(date, 7));
  const peers = useMemo(() => (data ? peersFor(symbol, date, data.events, (s) => UNIVERSE[s]?.sec, (s) => UNIVERSE[s]?.mc ?? 0) : []), [data, symbol, date]);
  if (loading && !data) return <Skeleton h={64} />;
  if (!peers.length) return null;
  const before = peers.filter((p) => p.d < date || (p.d === date && p.h === "bmo")).length;
  const sector = UNIVERSE[symbol]?.sec;
  return (
    <section className="card peers">
      <h4 className="eyebrow">Peers reporting nearby · {sector}</h4>
      <p className="small muted">
        {before > 0 ? <><b>{before}</b> {before === 1 ? "peer reports" : "peers report"} before {symbol}. Their results often move the whole group, a "read-through" to watch.</> : `${symbol} reports before its sector peers, so its results may set the tone for them.`}
      </p>
      <div className="peer-row">
        {peers.map((p) => (
          <button key={p.s} className="peer" onClick={() => setParam("t", p.s)} onMouseEnter={() => prefetchTicker(p.s)} title={`${co(p.s)?.n ?? p.s}: ${PHASE_LABEL[p.h]}`}>
            <Tile s={p.s} size={36} />
            <b>{p.s}</b>
            <span className="eyebrow">{fmtShort(p.d)} <Phase h={p.h} size={9} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Quarterly trend ────────────────────────────────────────────────────
export function QuarterTrend({ quarters, history }: { quarters: Quarter[]; history: Reaction[] }) {
  const rows = quarters.filter((q) => q.eps != null || q.rev != null);
  if (rows.length < 2) return null;
  const maxRev = Math.max(...rows.map((q) => q.rev ?? 0));
  const epsVals = rows.map((q) => q.eps ?? 0);
  const maxEps = Math.max(...epsVals.map(Math.abs), 0.01);
  const qLabel = (p: string) => { const d = new Date(p + "T12:00:00"); return `${d.toLocaleDateString("en-US", { month: "short" })} ’${p.slice(2, 4)}`; };
  const last = rows[rows.length - 1], yearAgo = rows.length >= 5 ? rows[rows.length - 5] : null;
  const revYoY = last.rev != null && yearAgo?.rev ? ((last.rev - yearAgo.rev) / yearAgo.rev) * 100 : null;
  const surprises = history.filter((h) => h.surprisePct != null).length;
  return (
    <section className="card qtrend">
      <h4 className="eyebrow">The last {rows.length} quarters</h4>
      <div className="qt-grid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((q) => (
          <div key={q.period} className="qt-col" title={`Quarter ending ${q.period}`}>
            <span className="qt-rev" style={{ height: `${q.rev && maxRev ? Math.max(4, (q.rev / maxRev) * 100) : 0}%` }} />
            <span className={`qt-eps ${(q.eps ?? 0) < 0 ? "neg" : ""}`} style={{ height: `${q.eps != null ? Math.max(3, (Math.abs(q.eps) / maxEps) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="qt-labels" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((q) => <span key={q.period}>{qLabel(q.period)}</span>)}
      </div>
      <div className="qt-legend small">
        <span><i className="lg-rev" /> <Term k="revenue">Revenue</Term> ≈ {money(last.rev)}{revYoY != null && <> ({pct(revYoY, 0)} vs a year ago)</>}</span>
        <span><i className="lg-eps" /> <Term k="eps">EPS</Term> {eps(last.eps)}</span>
        {last.gm != null && <span><Term k="grossmargin">Gross margin</Term> {last.gm.toFixed(0)}%</span>}
        {last.om != null && <span><Term k="opmargin">Op. margin</Term> {last.om.toFixed(0)}%</span>}
      </div>
      <p className="muted small">Reported (GAAP) figures from filings; revenue is estimated from sales per share × shares outstanding.{surprises ? " Beat/miss versus estimates is in the reaction table below." : ""}</p>
    </section>
  );
}

// ── .ics buttons ───────────────────────────────────────────────────────
export function icsPath(symbols: string[]) { return `${BASE}/api/ics?s=${symbols.map(encodeURIComponent).join(",")}`; }

export function IcsButtons({ symbols, compact }: { symbols: string[]; compact?: boolean }) {
  if (!symbols.length) return null;
  const path = icsPath(symbols);
  const webcal = `webcal://${location.host}${path}`;
  if (compact) {
    return <a className="btn btn-box ics-one" href={path} download={`${symbols[0]}-earnings.ics`} title="Add this company's report dates to your calendar"><Icon name="plus" size={12} /> Calendar</a>;
  }
  return (
    <div className="ics">
      <div>
        <b>Put these reports in your calendar.</b>
        <span className="muted small"> Subscribing keeps it updated as dates are confirmed; nothing to sign up for.</span>
      </div>
      <div className="row">
        <a className="btn btn-box on" href={webcal}><Icon name="plus" size={12} /> Subscribe</a>
        <a className="btn btn-box" href={path} download="metaphases-earnings.ics">Download .ics</a>
      </div>
    </div>
  );
}

// ── Season scoreboard ──────────────────────────────────────────────────
const SP_COUNT = Object.values(UNIVERSE).filter((c) => c.sp).length;

export function useSeason() {
  const today = todayISO();
  const from = addDays(today, -42);
  const { data, loading, error } = useCalendar(from, today);
  const season = useMemo(() => (data ? seasonScore(data.events, (s) => !!UNIVERSE[s]?.sp, SP_COUNT, from, today) : null), [data]);
  return { season, loading, error };
}

export function SeasonScoreboard({ slim }: { slim?: boolean }) {
  const { season, loading } = useSeason();
  if (loading && !season) return slim ? null : <Skeleton h={90} />;
  if (!season) return null;
  if (slim) {
    if (!season.enough) return null;
    return (
      <div className="season-slim">
        <span className="eyebrow">Earnings season</span>
        <span className="season-bar" aria-hidden><i style={{ width: `${season.reportedPct}%` }} /></span>
        <span><b>{season.reportedPct}%</b> of the S&P 500 reported · <b>{season.epsBeatPct}%</b> beat on EPS · median <Term k="surprise">surprise</Term> <b>{pct(season.medianSurprise)}</b></span>
      </div>
    );
  }
  return (
    <section className="card season">
      <h4 className="eyebrow">Earnings season scoreboard · S&P 500 · {fmtShort(season.from)}–{fmtShort(season.to)}</h4>
      {!season.enough ? (
        <p className="muted">Too early in the season: only {season.reported} index members have reported in this window.</p>
      ) : (
        <>
          <div className="season-track"><i style={{ width: `${season.reportedPct}%` }} /><span>{season.reported} of {season.members} reported</span></div>
          <div className="season-stats">
            <div><span className="eyebrow">Reported</span><b>{season.reportedPct}%</b></div>
            <div><span className="eyebrow"><Term k="eps">EPS</Term> beat rate</span><b>{season.epsBeatPct ?? "—"}%</b></div>
            <div><span className="eyebrow"><Term k="revenue">Revenue</Term> beat rate</span><b>{season.revBeatPct ?? "—"}%</b></div>
            <div><span className="eyebrow">Median <Term k="surprise">surprise</Term></span><b>{pct(season.medianSurprise)}</b></div>
          </div>
          <p className="muted small">Counts each index member's latest report in the last six weeks (our free data window). Historically, roughly three in four companies beat EPS estimates in a typical quarter.</p>
        </>
      )}
    </section>
  );
}
