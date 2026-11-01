import { useMemo } from "react";
import type { EarningsEvent, MacroResponse } from "../../shared/types";
import { buildBrief } from "../lib/brief";
import { nameOf, UNIVERSE } from "../lib/data";
import { MON3, parse, WEEKDAYS } from "../lib/dates";
import { mcap } from "../lib/format";
import { prefetchTicker } from "../lib/api";
import { setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Phase, PHASE_LABEL, Skeleton, Term, Tile } from "./bits";

const wd = (d: string) => WEEKDAYS[(parse(d).getDay() + 6) % 7];
const short = (d: string) => `${MON3[parse(d).getMonth()][0]}${MON3[parse(d).getMonth()].slice(1).toLowerCase()} ${parse(d).getDate()}`;
function range(week: string[]) {
  const a = parse(week[0]), b = parse(week[4]);
  return a.getMonth() === b.getMonth() ? `${short(week[0])}–${b.getDate()}` : `${short(week[0])}–${short(week[4])}`;
}
const isPhone = () => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } };

/** "This week" card: a deterministic, Market Digest-style 30-second read built from data already loaded. */
export function WeekBrief({ week, current, events, loading, error, macro }: {
  week: string[]; current: boolean; events: EarningsEvent[]; loading: boolean; error: string | null; macro: MacroResponse | null;
}) {
  const { prefs } = useStore();
  const open = prefs.brief === "auto" ? !isPhone() : prefs.brief === "open";
  const b = useMemo(() => buildBrief(week, events, macro, UNIVERSE), [week, events, macro]);
  const ready = !loading; // stale events from the previous range must not read as "a quiet week"
  const noEarnings = ready && !error && b.total === 0;
  const largestLine = b.largest.reporting.length > 0
    ? `${b.largest.reporting.length} of the ${b.largest.of} largest`
    : `none of the ${b.largest.of} largest`;

  return (
    <section className={`brief ${open ? "open" : ""}`} aria-label={`${current ? "This week" : `Week of ${range(week)}`}: the brief`}>
      <button className="brief-head" onClick={() => actions.setPref("brief", open ? "closed" : "open")} aria-expanded={open}>
        <span className="eyebrow brief-when">{current ? "This week" : "Week of"} · {range(week)}</span>
        <span className="brief-sum">
          {!ready ? <Skeleton w={180} h={14} /> : error ? "Earnings didn't load" : noEarnings ? "A quiet week" : <><b>{b.total}</b> {b.total === 1 ? "company reports" : "companies report"} · {largestLine}</>}
        </span>
        <span className={`chev ${open ? "up" : ""}`}><Icon name="down" size={12} /></span>
      </button>

      {open && (
        <div className="brief-body">
          <div className="brief-col">
            <span className="eyebrow">Biggest reporters</span>
            {!ready ? (
              <div className="brief-skel">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={36} />)}</div>
            ) : error ? (
              <p className="muted small">The earnings calendar didn't load, so this brief only covers the economy.</p>
            ) : noEarnings ? (
              <p className="brief-quiet">No earnings on the calendar this week{b.holidays.length ? ", and markets take a day off" : ""}. A good week to read up on the companies you follow.</p>
            ) : b.top.length === 0 ? (
              <p className="muted small">{b.total} companies report, none of them on our tracked list.</p>
            ) : (
              <ol className="brief-top">
                {b.top.map((t) => (
                  <li key={t.s}>
                    <button className="brief-co" onClick={() => setParam("t", t.s)} onMouseEnter={() => prefetchTicker(t.s)}>
                      <Tile s={t.s} size={30} />
                      <span className="brief-id"><b>{t.s}</b><span className="muted">{nameOf(t.s)}</span></span>
                      <span className="brief-when-co"><span className="eyebrow">{wd(t.d)}</span><Phase h={t.h} size={12} /><span className="sr">{PHASE_LABEL[t.h]}</span></span>
                      <span className="eyebrow brief-mc" title="Market value">{mcap(t.mc)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {ready && !error && b.total > 0 && (
              <p className="brief-stat">
                <b>{b.sp}</b> <Term k="sp500">S&amp;P 500</Term> {b.sp === 1 ? "company reports" : "companies report"}; {largestLine}
                {b.largest.reporting.length > 0 && <> ({b.largest.reporting.map(nameOf).join(", ")})</>}.
              </p>
            )}
          </div>
          <div className="brief-col">
            <span className="eyebrow">Also this week</span>
            <ul className="brief-macro">
              {b.holidays.map((h) => <li key={h.date}><span className="eyebrow">{wd(h.date)}</span><span><b>Markets closed</b> <span className="muted">for {h.name}.</span></span></li>)}
              {b.macro.map((m) => (
                <li key={m.key + m.date} className={`kind-${m.kind}`}>
                  <span className="eyebrow">{wd(m.date)}</span>
                  <span><b>{m.key === "cpi" ? <Term k="cpi">{m.name}</Term> : m.key === "fomc" ? <Term k="fomc">{m.name}</Term> : m.name}</b> <span className="muted">{m.blurb}</span></span>
                </li>
              ))}
              {macro && !b.macro.length && !b.holidays.length && <li><span className="eyebrow">—</span><span className="muted">No major economic releases.</span></li>}
              {!macro && <li><span className="eyebrow">—</span><span className="muted">{loading ? "Loading the economic calendar…" : "The economic calendar is offline right now."}</span></li>}
            </ul>
            {b.mood && (
              <p className="brief-stat">
                <Term k="mood">Market mood</Term> is <b>{b.mood.score}</b> ({b.mood.label.toLowerCase()}) today
                {b.mood.change5d != null && <>, {b.mood.change5d === 0 ? "unchanged" : `${b.mood.change5d > 0 ? "up" : "down"} ${Math.abs(b.mood.change5d)}`} over the last five trading days</>}.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
