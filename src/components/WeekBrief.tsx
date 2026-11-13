import { useMemo } from "react";
import type { CalendarResponse, MacroResponse } from "../../shared/types";
import { buildBrief } from "../lib/brief";
import { nameOf, UNIVERSE } from "../lib/data";
import { MON3, parse, todayISO, WEEKDAYS } from "../lib/dates";
import { GLOSSARY } from "../lib/glossary";
import { mcap } from "../lib/format";
import { prefetchTicker } from "../lib/api";
import { setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Phase, Skeleton, Term, Tile } from "./bits";

const FULL_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const dayIdx = (d: string) => (parse(d).getDay() + 6) % 7;
const Day = ({ d }: { d: string }) => <span className="eyebrow" aria-label={FULL_DAY[dayIdx(d)]}>{WEEKDAYS[dayIdx(d)]}</span>;
const short = (d: string) => { const m = MON3[parse(d).getMonth()]; return `${m[0]}${m.slice(1).toLowerCase()} ${parse(d).getDate()}`; };
function range(week: string[]) {
  const a = parse(week[0]), b = parse(week[4]);
  return a.getMonth() === b.getMonth() ? `${short(week[0])}–${b.getDate()}` : `${short(week[0])}–${short(week[4])}`;
}
const isPhone = () => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } };

/** "This week" card: a deterministic, Market Digest-style 30-second read built from data already loaded. */
export function WeekBrief({ week, current, cal, calLoading, calError, macro, macroLoading }: {
  week: string[]; current: boolean;
  cal: CalendarResponse | null; calLoading: boolean; calError: string | null;
  macro: MacroResponse | null; macroLoading: boolean;
}) {
  const { prefs } = useStore();
  const open = prefs.brief === "auto" ? !isPhone() : prefs.brief === "open";
  // Only trust calendar data whose range covers this week (useApi keeps the previous range while the next loads).
  const covers = !!cal && cal.from <= week[0] && cal.to >= week[4];
  const ready = covers && !calLoading;
  const b = useMemo(
    () => buildBrief(week, covers ? cal!.events : [], covers ? cal!.warnings : [], macro, UNIVERSE, todayISO()),
    [week, cal, covers, macro],
  );
  const partial = b.missingDays.length > 0;
  const allMissing = partial && b.total === 0;
  const quiet = ready && !partial && b.total === 0;
  const atLeast = partial ? "at least " : "";
  const nBig = b.largest.reporting.length;
  const bigLine = `${nBig > 0 ? nBig : "none"} of the ${b.largest.of} largest`;
  const when = current ? `This week · ${range(week)}` : `Week of ${range(week)}`;

  return (
    <section className={`brief ${open ? "open" : ""}`} aria-label={`${when}: the brief`}>
      <button className="brief-head" onClick={() => actions.setPref("brief", open ? "closed" : "open")} aria-expanded={open}>
        <span className="eyebrow brief-when">{when}</span>
        <span className="brief-sum">
          {calError ? "Earnings didn't load"
            : !ready ? <Skeleton w={180} h={14} />
            : allMissing ? "Earnings for this week didn't load"
            : quiet ? "A quiet week"
            : <>{atLeast}<b>{b.tracked}</b> popular {b.tracked === 1 ? "company reports" : "companies report"} ({b.total} in all) · {bigLine} S&amp;P 500 companies</>}
        </span>
        <span className={`chev ${open ? "up" : ""}`}><Icon name="down" size={12} /></span>
      </button>

      {open && (
        <div className="brief-body">
          <div className="brief-col">
            <span className="eyebrow">Biggest reporters</span>
            {calError ? (
              <p className="muted small">The earnings calendar didn't load, so this brief only covers the economy.</p>
            ) : !ready ? (
              <div className="brief-skel">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={36} />)}</div>
            ) : allMissing ? (
              <p className="muted small">We couldn't load this week's earnings from our data provider. Try again in a few minutes.</p>
            ) : quiet ? (
              <p className="brief-quiet">None of the companies we follow report this week{b.holidays.length ? ", and markets take a day off" : ""}. A good week to read up on them.</p>
            ) : b.top.length === 0 ? (
              <p className="muted small">{b.total} {b.total === 1 ? "company reports" : "companies report"}, none of them on our tracked list.</p>
            ) : (
              <ol className="brief-top">
                {b.top.map((t) => (
                  <li key={t.s}>
                    <button className="brief-co" onClick={() => setParam("t", t.s)} onMouseEnter={() => prefetchTicker(t.s)}>
                      <Tile s={t.s} size={30} />
                      <span className="brief-id"><b>{t.s}</b><span className="muted">{nameOf(t.s)}</span></span>
                      {t.c
                        // 0064: projected onto a market holiday, so no day or session is stated.
                        ? <span className="brief-when-co muted small" data-testid="brief-unconfirmed" title={`Our data feed projects ${t.c}, when markets are closed`}>Date not confirmed <Phase h="" size={12} projected /></span>
                        : <span className="brief-when-co"><Day d={t.d} /><Phase h={t.h} size={12} /></span>}
                      <span className="eyebrow brief-mc" title="Market value">{mcap(t.mc)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {ready && !calError && b.total > 0 && (
              <p className="brief-stat">
                {partial ? "At least " : ""}<b>{b.sp}</b> <Term k="sp500">S&amp;P 500</Term> {b.sp === 1 ? "company reports" : "companies report"}, including {bigLine}
                {nBig > 0 && <> ({b.largest.reporting.map(nameOf).join(", ")})</>}.
              </p>
            )}
            {ready && partial && !allMissing && (
              <p className="muted small">Earnings for {b.missingDays.map((d) => FULL_DAY[dayIdx(d)]).join(", ")} didn't load, so these counts are incomplete.</p>
            )}
          </div>
          <div className="brief-col">
            <span className="eyebrow">Also this week</span>
            <ul className="brief-macro">
              {b.holidays.map((h) => <li key={h.date}><Day d={h.date} /><span><b>Markets closed</b> <span className="muted">for {h.name}.</span></span></li>)}
              {b.macro.map((m) => (
                <li key={m.key + m.date} className={`kind-${m.kind}`}>
                  <Day d={m.date} />
                  <span><b>{GLOSSARY[m.key] ? <Term k={m.key}>{m.name}</Term> : m.name}</b> <span className="muted">{m.blurb}</span></span>
                </li>
              ))}
              {macro && !b.macro.length && (
                <li><span className="eyebrow">—</span><span className="muted">{b.macroComplete ? "No major economic releases." : "Our economic calendar doesn't fully cover this week."}</span></li>
              )}
              {macro && b.macro.length > 0 && !b.macroComplete && (
                <li><span className="eyebrow">—</span><span className="muted">Some releases may be missing.</span></li>
              )}
              {!macro && <li><span className="eyebrow">—</span><span className="muted">{macroLoading ? "Loading the economic calendar…" : "The economic calendar is offline right now."}</span></li>}
            </ul>
            {b.mood && (
              <p className="brief-stat">
                Right now, <Term k="mood">Market mood</Term> reads <b>{b.mood.score}</b> ({b.mood.label.toLowerCase()})
                {b.mood.change5d != null && <>, {b.mood.change5d === 0 ? "unchanged" : `${b.mood.change5d > 0 ? "up" : "down"} ${Math.abs(b.mood.change5d)}`} over the last five trading days</>}.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
