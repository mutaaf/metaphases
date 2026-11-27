import { useEffect, useMemo, useState } from "react";
import { useCalendar } from "../lib/api";
import { co, curOf, epsOf, resultOf, surprise } from "../lib/data";
import { epsJudged } from "../../shared/compare";
import { revenueBeatRate } from "../../shared/compare";
import { MONTHS, parse, todayISO } from "../lib/dates";
import { retraceRange, retraceView } from "../lib/retrace";

const fmtMD = (d: string) => parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
import { pct } from "../lib/format";
import { navigate } from "../lib/router";
import { Icon, Notice, Phase, Skeleton, Term } from "../components/bits";
import { EventRow } from "../components/Calendar";
import { PageHero } from "../components/Hero";
import { SeasonScoreboard } from "../components/Depth";

export default function RetracePage() {
  const today = todayISO();
  const [offset, setOffset] = useState(0);
  const range = retraceRange(today, offset);
  const m = range.month;
  const { data, loading, error } = useCalendar(range.fetchFrom, range.fetchTo);
  useEffect(() => { document.title = "Retrace: how the reports really landed · Metaphases"; }, []);

  // 0014: a young month (under 25 graded) grades the last 30 days instead, so peak season is never empty.
  const view = useMemo(() => retraceView(data?.events ?? [], today, offset), [data, today, offset]);
  const trailing = view.mode === "trailing";
  const mName = MONTHS[m.getMonth()];
  const span = `${fmtMD(view.from)} – ${fmtMD(view.to)}`;
  const done = view.events;
  const by = (k: string) => done.filter((e) => resultOf(e) === k).length;
  // 0049: an EPS on another basis from its estimate (REIT FFO vs GAAP) is neither a beat nor counted.
  const epsV = done.map(epsOf);
  const epsJ = epsV.filter(epsJudged);
  const epsBeat = epsJ.filter((j) => j.v === "beat").length;
  const epsNC = epsV.filter((j) => j.v === "not-comparable").length;
  const rev = revenueBeatRate(done, curOf);
  const sur = done.map(surprise).filter((x): x is number => x != null && Math.abs(x) < 500);
  const median = sur.length ? [...sur].sort((a, b) => a - b)[Math.floor(sur.length / 2)] : null;
  const sectors = useMemo(() => {
    // Only judged reports count (0049): a basis mix is neither a "beat both" nor a surprise.
    const s: Record<string, { n: number; beat: number; surprises: number[]; med: number | null }> = {};
    for (const e of done) { if (resultOf(e) == null) continue; const k = co(e.s)?.sec || "Other"; (s[k] ??= { n: 0, beat: 0, surprises: [], med: null }); s[k].n++; if (resultOf(e) === "beat") s[k].beat++; const x = surprise(e); if (x != null) s[k].surprises.push(x); }
    for (const v of Object.values(s)) { const xs = v.surprises.sort((a, b) => a - b); v.med = xs.length ? xs[Math.floor(xs.length / 2)] : null; }
    return Object.entries(s).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].beat / b[1].n - a[1].beat / a[1].n);
  }, [view]);
  const ranked = [...done].filter((e) => surprise(e) != null && Math.abs(surprise(e)!) < 500).sort((a, b) => surprise(b)! - surprise(a)!);
  // The busiest reported day this month: where "Jump to a reported day" lands.
  const busiest = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of done) c[e.d] = (c[e.d] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [view]);
  const jump = () => { if (busiest) navigate(`/?d=${busiest}&day=${busiest}`); else navigate("/"); };

  return (
    <div className="page">
      <PageHero
        eyebrow={trailing ? `Retrace · Last 30 days` : `Retrace · ${mName} ${m.getFullYear()}`}
        title={trailing ? <><em>Retrace</em> the last 30 days.</> : <><em>Retrace</em> {mName}.</>}
        dek={<>Market Digest grades its own picks against what really happened. Retrace does the same for Wall Street: every report {trailing ? "in the last 30 days" : offset === 0 ? "this month" : `in ${mName}`}, scored against its <Term k="consensus">consensus</Term>.</>}
        primary={{ label: busiest ? "Jump to the busiest reported day" : "Back to the calendar", onClick: jump, icon: "right" }}
        secondary={{ label: "How beats are judged", onClick: () => navigate("/learn#beat") }}
      />
      <div className="row gap">
        <button className="btn btn-box sq" onClick={() => setOffset(offset + 1)} aria-label="Previous month"><Icon name="left" /></button>
        <span className="btn btn-box on label">{trailing ? `Last 30 days · ${span}` : `${mName} ${m.getFullYear()}`}</span>
        <button className="btn btn-box sq" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 1))} aria-label="Next month"><Icon name="right" /></button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {trailing && !loading && <p className="muted small retrace-trailing-note" data-testid="retrace-trailing-note">{view.monthCount === 0 ? `No ${mName} reports are in yet` : `Only ${view.monthCount} ${mName} ${view.monthCount === 1 ? "report is" : "reports are"} in so far`}, so this grades the last 30 days. The {mName} view takes over once 25 are in.</p>}
      {offset > 1 && !loading && !done.length && <Notice>Our free data window only reaches back about a month, so older results will appear as the archive grows.</Notice>}
      {loading ? <Skeleton h={200} /> : done.length === 0 ? (
        <section className="empty-cta">
          <span className="empty-moon"><Phase h="amc" size={44} /></span>
          <h2>No results to grade yet.</h2>
          <p className="muted">The first reports of the month land soon. Until then, see who's coming up.</p>
          <button className="cta cta-primary" onClick={() => navigate("/")}>Open the calendar</button>
        </section>
      ) : (
        <>
          {offset === 0 && <SeasonScoreboard />}
          <div className="stat-row">
            <div className="stat"><span className="eyebrow">Reported</span><b>{done.length}</b></div>
            <div className="stat"><span className="eyebrow"><Term k="eps">EPS</Term> beat rate</span><b>{epsJ.length ? `${Math.round((epsBeat / epsJ.length) * 100)}%` : "—"}</b>{epsNC > 0 && <small className="muted eps-excluded" data-testid="eps-excluded">{epsNC} <Term k="epsbasis">can't compare</Term></small>}</div>
            <div className="stat"><span className="eyebrow"><Term k="revenue">Revenue</Term> beat rate</span><b>{rev.pct != null ? `${Math.round(rev.pct)}%` : "—"}</b>{rev.excluded > 0 && <small className="muted rev-excluded">{rev.excluded} <Term k="revbasis">can't compare</Term></small>}</div>
            <div className="stat"><span className="eyebrow">Median <Term k="surprise">surprise</Term></span><b>{pct(median)}</b></div>
          </div>
          <p className="muted small retrace-basis">Beats and misses are judged against the <Term k="beat">estimate as it stood before the report</Term> wherever we have it, not one revised afterwards.</p>
          <section className="card">
            <h4 className="eyebrow">{trailing ? "30 days in one bar" : "The month in one bar"}</h4>
            <div className="big-strip">
              <span className="res-beat" style={{ flex: by("beat") }}>{by("beat")} beat</span>
              <span className="res-mixed" style={{ flex: by("mixed") }}>{by("mixed")} mixed</span>
              <span className="res-miss" style={{ flex: by("miss") }}>{by("miss")} miss</span>
            </div>
            <p className="muted small">Analysts set the bar low on purpose: historically about three in four companies beat on EPS. The interesting signal is who <i>doesn't</i>.</p>
          </section>
          <div className="two-col">
            <section className="card">
              <h4 className="eyebrow">By sector</h4>
              <table className="rx-table">
                <thead><tr><th>Sector</th><th>Reports</th><th>Beat both</th><th>Median surprise</th></tr></thead>
                <tbody>{sectors.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.n}</td><td>{Math.round((v.beat / v.n) * 100)}%</td><td className={v.med == null ? "" : v.med >= 0 ? "pos" : "neg"}>{v.med == null ? "—" : pct(v.med)}</td></tr>)}</tbody>
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
