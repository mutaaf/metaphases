import { useEffect, useMemo, useState } from "react";
import { useCalendar } from "../lib/api";
import { co, curOf, resultOf, surprise } from "../lib/data";
import { revenueBeatRate } from "../../shared/compare";
import { MONTHS, parse, todayISO } from "../lib/dates";
import { pct } from "../lib/format";
import { navigate } from "../lib/router";
import { Icon, Notice, Phase, Skeleton, Term } from "../components/bits";
import { EventRow } from "../components/Calendar";
import { PageHero } from "../components/Hero";
import { SeasonScoreboard } from "../components/Depth";

export default function RetracePage() {
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
  const rev = revenueBeatRate(done, curOf);
  const sur = done.map(surprise).filter((x): x is number => x != null && Math.abs(x) < 500);
  const median = sur.length ? [...sur].sort((a, b) => a - b)[Math.floor(sur.length / 2)] : null;
  const sectors = useMemo(() => {
    const s: Record<string, { n: number; beat: number; surprises: number[]; med: number }> = {};
    for (const e of done) { const k = co(e.s)?.sec || "Other"; (s[k] ??= { n: 0, beat: 0, surprises: [], med: 0 }); s[k].n++; if (resultOf(e) === "beat") s[k].beat++; const x = surprise(e); if (x != null) s[k].surprises.push(x); }
    for (const v of Object.values(s)) { const xs = v.surprises.sort((a, b) => a - b); v.med = xs.length ? xs[Math.floor(xs.length / 2)] : 0; }
    return Object.entries(s).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].beat / b[1].n - a[1].beat / a[1].n);
  }, [data]);
  const ranked = [...done].filter((e) => surprise(e) != null && Math.abs(surprise(e)!) < 500).sort((a, b) => surprise(b)! - surprise(a)!);
  // The busiest reported day this month: where "Jump to a reported day" lands.
  const busiest = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of done) c[e.d] = (c[e.d] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [data]);
  const jump = () => { if (busiest) navigate(`/?d=${busiest}&day=${busiest}`); else navigate("/"); };

  return (
    <div className="page">
      <PageHero
        eyebrow={`Retrace · ${MONTHS[m.getMonth()]} ${m.getFullYear()}`}
        title={<><em>Retrace</em> {MONTHS[m.getMonth()]}.</>}
        dek={<>Market Digest grades its own picks against what really happened. Retrace does the same for Wall Street: every report this month, scored against its <Term k="consensus">consensus</Term>.</>}
        primary={{ label: busiest ? "Jump to the busiest reported day" : "Back to the calendar", onClick: jump, icon: "right" }}
        secondary={{ label: "How beats are judged", onClick: () => navigate("/learn#beat") }}
      />
      <div className="row gap">
        <button className="btn btn-box sq" onClick={() => setOffset(offset + 1)} aria-label="Previous month"><Icon name="left" /></button>
        <span className="btn btn-box on label">{MONTHS[m.getMonth()]} {m.getFullYear()}</span>
        <button className="btn btn-box sq" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 1))} aria-label="Next month"><Icon name="right" /></button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
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
            <div className="stat"><span className="eyebrow"><Term k="eps">EPS</Term> beat rate</span><b>{Math.round((epsBeat / done.length) * 100)}%</b></div>
            <div className="stat"><span className="eyebrow"><Term k="revenue">Revenue</Term> beat rate</span><b>{rev.pct != null ? `${Math.round(rev.pct)}%` : "—"}</b>{rev.excluded > 0 && <small className="muted rev-excluded">{rev.excluded} <Term k="revbasis">can't compare</Term></small>}</div>
            <div className="stat"><span className="eyebrow">Median <Term k="surprise">surprise</Term></span><b>{pct(median)}</b></div>
          </div>
          <section className="card">
            <h4 className="eyebrow">The month in one bar</h4>
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
