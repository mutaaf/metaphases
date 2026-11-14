import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../lib/insights";
import type { EarningsEvent, MacroEvent } from "../../shared/types";
import { EARLY_CLOSE, HOLIDAYS } from "../../shared/market";
import { useCalendar, useMacro, prefetchTicker } from "../lib/api";
import { checkingOf, missingDays } from "../lib/partial";
import { co, curOf, epsBasisDiffers, epsOf, heldVia, nameOf, popularity, resultOf, SECTORS, surprise, UNIVERSE } from "../lib/data";
import { revenueSkipped, revenueVerdict } from "../../shared/compare";
import { noResultYet } from "../../shared/pending";
import { eventProjected } from "../../shared/projected";
import { dateMark } from "../lib/dateMark";
import { sessionText } from "../lib/sessionText";
import { splitClosed, unconfirmedRow } from "../../shared/closedRows";
import { addDays, fmtDay, fmtLong, iso, MONTHS, MON3, monthWeeks, parse, todayISO, weekOf, WEEKDAYS, isWeekend } from "../lib/dates";
import { eps, epsIn, money, moneyIn, pct } from "../lib/format";
import { navigate, param, setParam, useLocation } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Notice, Phase, PHASE_LABEL, sessionLabel, Skeleton, Term, Tile } from "./bits";
import { WeekBrief } from "./WeekBrief";
import { AskWeekButton } from "./ai/mount";
import { briefWeek } from "../lib/brief";
import { useDialog } from "../lib/dialog";
import { HomeHero } from "./Hero";

const HOLIDAY = Object.fromEntries(HOLIDAYS.map((h) => [h.date, h.name]));
const PER_CELL = 3;

// An empty trading day means none of the companies we follow report, never
// that nobody does: Japan's megabanks and hundreds of small caps can (0051).
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NONE_OURS = "None of the companies we follow";
function EmptyTag() {
  const { prefs } = useStore();
  // Watchlist, holdings, S&P 500, mega caps or a sector: plenty of ours may report.
  if (!["popular", "everything"].includes(prefs.filter) || prefs.sector) return <span className="empty-tag">None with these filters</span>;
  return <span className="empty-tag empty-none"><Term k="follow">{NONE_OURS}</Term></span>;
}

export const FILTERS: { key: string; label: string; hint: string }[] = [
  { key: "popular", label: "Most popular", hint: "The ~630 companies investors watch most" },
  { key: "sp500", label: "S&P 500", hint: "Index members only" },
  { key: "mega", label: "Mega caps", hint: "Worth $200B or more" },
  { key: "everything", label: "Everything", hint: "Adds every $1B+ revenue reporter" },
  { key: "watch", label: "My watchlist", hint: "Just the names you star" },
  { key: "holdings", label: "My holdings", hint: "Direct + inside your funds (Compass)" },
];

export function nextTradingDay(from: string) {
  let d = from;
  const now = new Date();
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (ny.getHours() >= 16) d = addDays(d, 1);
  while (isWeekend(d) || HOLIDAY[d]) d = addDays(d, 1);
  return d;
}

export function useFiltered(events: EarningsEvent[]) {
  const { prefs, watch, holdings } = useStore();
  return useMemo(() => {
    const watchSet = new Set(watch.map((w) => w.s));
    const direct = new Set(holdings.map((h) => h.s));
    const keep = (e: EarningsEvent) => {
      const c = UNIVERSE[e.s];
      if (prefs.sector && c?.sec !== prefs.sector) return false;
      switch (prefs.filter) {
        case "sp500": return !!c?.sp;
        case "mega": return (c?.mc ?? 0) >= 200000;
        case "everything": return true;
        case "watch": return watchSet.has(e.s);
        case "holdings": return direct.has(e.s) || heldVia(e.s, holdings).length > 0;
        default: return e.t === 1;
      }
    };
    const rank = (e: EarningsEvent) => (watchSet.has(e.s) ? 1e8 : 0) + (direct.has(e.s) ? 2e8 : 0) + popularity(e);
    return events.filter(keep).sort((a, b) => rank(b) - rank(a));
  }, [events, prefs.filter, prefs.sector, watch, holdings]);
}

function TileButton({ e, size = 44 }: { e: EarningsEvent; size?: number }) {
  const { watch } = useStore();
  const r = resultOf(e);
  const starred = watch.some((w) => w.s === e.s);
  const proj = !r && eventProjected(e, todayISO());
  return (
    <button
      className={`tbtn ${r ? `res-${r}` : ""}${proj ? " tbtn-projected" : ""}`}
      onClick={(ev) => { ev.stopPropagation(); setParam("t", e.s); }}
      onMouseEnter={() => prefetchTicker(e.s)}
      title={`${nameOf(e.s)} (${e.s}) · ${sessionText(e.h, e.hs)}${e.eE != null ? ` · est. ${epsIn(e.eE, curOf(e.s))}` : ""}${r ? ` · ${r.toUpperCase()}` : ""}${proj ? " · date not confirmed" : ""}`}
      aria-label={`${nameOf(e.s)}, ${sessionText(e.h, e.hs).toLowerCase()}, ${r ? r : proj ? "date not confirmed" : "upcoming"}${starred ? ", on your watchlist" : ""}`}
    >
      <Tile s={e.s} size={size} />
      <span className="tbtn-phase"><Phase h={e.h} size={11} projected={proj} /></span>
      {starred && <span className="tbtn-star" aria-label="On your watchlist" />}
    </button>
  );
}

function DayCell({ day, events, inMonth, today, next, macro, onOpen, unknown }: { day: string; events: EarningsEvent[]; inMonth: boolean; today: string; next: string; macro: MacroEvent[]; onOpen: () => void; unknown?: "loading" | "failed" }) {
  const d = parse(day);
  const holiday = HOLIDAY[day];
  const isNext = day === next;
  const past = day < today;
  const reported = events.filter((e) => e.eA != null).length;
  // 0064: a row projected onto a holiday isn't reporting that day, so it isn't counted.
  const dated = splitClosed(events).dated.length;
  return (
    <div className={`cell ${inMonth ? "" : "out"} ${isNext ? "next" : ""} ${past ? "past" : ""} ${holiday ? "holiday" : ""}`} onClick={events.length ? onOpen : undefined} role={events.length ? "button" : undefined} tabIndex={events.length ? 0 : -1} onKeyDown={(e) => e.key === "Enter" && events.length && onOpen()}>
      <div className="cell-head">
        {isNext ? (
          <span className="next-badge"><i />{MON3[d.getMonth()]} {String(d.getDate()).padStart(2, "0")} · {day === today ? "Today" : "Next trading day"}</span>
        ) : (
          <span className="cell-date"><span className="cell-wd">{WEEKDAYS[(d.getDay() + 6) % 7]} · </span>{MON3[d.getMonth()]} <b>{String(d.getDate()).padStart(2, "0")}</b></span>
        )}
        {dated > 0 && !isNext && <span className="cell-count">{String(dated).padStart(2, "0")}</span>}
      </div>
      {macro.length > 0 && (
        <div className="cell-macro">{macro.map((m) => <span key={m.key} className={`mtag kind-${m.kind}`} title={m.blurb}>{m.name}</span>)}</div>
      )}
      {holiday ? (
        <span className="empty-tag">Market closed · {holiday}</span>
      ) : events.length === 0 ? (
        !inMonth ? null
          : unknown === "failed" ? <span className="empty-tag unknown-tag">Didn't load</span>
          : unknown === "loading" ? null
          : <EmptyTag />
      ) : (
        <div className="cell-tiles">
          {events.slice(0, PER_CELL).map((e) => <TileButton key={e.s} e={e} />)}
          {events.length > PER_CELL && <span className="more">+{events.length - PER_CELL}</span>}
        </div>
      )}
      {EARLY_CLOSE[day] && <span className="early">{EARLY_CLOSE[day]}</span>}
      {past && reported > 0 && <ResultStrip events={events} />}
    </div>
  );
}

function ResultStrip({ events }: { events: EarningsEvent[] }) {
  const rs = events.map(resultOf).filter(Boolean);
  if (!rs.length) return null;
  const n = (k: string) => rs.filter((r) => r === k).length;
  return (
    <span className="rstrip" title={`${n("beat")} beat · ${n("mixed")} mixed · ${n("miss")} miss`}>
      <i className="res-beat" style={{ flex: n("beat") }} /><i className="res-mixed" style={{ flex: n("mixed") }} /><i className="res-miss" style={{ flex: n("miss") }} />
    </span>
  );
}

/** Rows for the week + day views and the day drawer. */
export function EventRow({ e, showDate }: { e: EarningsEvent; showDate?: boolean }) {
  const r = resultOf(e);
  const s = surprise(e);
  const c = co(e.s);
  const cur = curOf(e.s);
  const mark = dateMark(e, todayISO());
  return (
    <button className="erow" onClick={() => setParam("t", e.s)} onMouseEnter={() => prefetchTicker(e.s)}>
      <Tile s={e.s} size={34} />
      <span className="erow-id">
        <b>{e.s}</b>
        <span className="muted">{nameOf(e.s)}</span>
        {mark?.kind === "differs" && <span className="erow-x" title="Our data feed and Nasdaq's calendar disagree on this report's date or time. Treat it as unconfirmed until the company announces it.">{mark.label}</span>}
        {(mark?.kind === "projected" || mark?.kind === "closed") && <span className="erow-proj" data-testid="erow-proj" title="Date not yet confirmed by the company: this is our data feed's projection, and it can move.">Projected date</span>}
        {!mark && e.hs === "n" && e.h && e.eA == null && <span className="erow-proj" data-testid="erow-expected" title="Our data feed left the time blank; this one is from Nasdaq's calendar. The company hasn't said.">Time expected</span>}
        {mark?.kind === "overdue" && <span className="erow-proj" data-testid="erow-overdue" title="Our data feed expected a report this day, but no results came out then. It isn't counted as reporting.">No report that day</span>}
      </span>
      {showDate && <span className="eyebrow">{fmtLong(e.d).split(",")[0]}</span>}
      {(() => { const j = e.eA != null ? epsOf(e) : null; return j?.via ? <span className="erow-num" title="The data feed's estimate is on another basis from the actual (e.g. net income vs FFO), so this is Nasdaq's forecast on the actual's basis."><span className="eyebrow">Nasdaq est</span>{epsIn(j.est, cur)}</span> : <span className="erow-num"><span className="eyebrow">EPS est</span>{epsIn(e.eE, cur)}</span>; })()}
      {(() => { const j = e.eA != null ? epsOf(e) : null; return j?.act != null
        // 0058: judged on Nasdaq's pair, so show that pair; the company's own figure is in the title.
        ? <span className="erow-num" data-testid="nq-actual" title={`Our data feed's figure is ${epsIn(e.eA, cur)}. This is Nasdaq's figure on the same basis as the estimate, and the result is judged on that pair.`}><span className="eyebrow">Nasdaq actual</span>{epsIn(j.act, cur)}</span>
        : <span className="erow-num"><span className="eyebrow">{e.eA != null ? "Actual" : "Rev est"}</span>{e.eA != null ? epsIn(e.eA, cur) : moneyIn(e.rE, cur)}</span>; })()}
      <span className="erow-res">
        {r ? <><span className={`chip res-${r}`}>{r}{s != null ? ` ${pct(s, 0)}` : ""}</span>{(() => { const rv = revenueVerdict(e, cur); return revenueSkipped(rv) && <span className="eps-only" title={rv === "revised" ? "Judged on EPS only: the revenue estimate was revised after the report, so we can't tell if it was a miss." : "Judged on EPS only: the reported revenue isn't counted the same way as the forecast."}>EPS only</span>; })()}</> : e.eA != null && epsBasisDiffers(e) ? <span className="chip chip-nores" data-testid="eps-basis" title="EPS basis differs from the estimate (e.g. FFO vs net income), so it isn't called a beat or a miss.">Basis differs</span> : e.eA != null && epsOf(e).pending ? <span className="chip chip-nores" data-testid="eps-pending" title="This estimate is Nasdaq's, and Nasdaq posts its result on the same basis a day or two after the report. Until then we don't call it a beat or a miss.">Judging soon</span> : !e.c && !e.od && noResultYet(e, todayISO()) ? <span className="chip chip-nores" title="The data feed expected a report this day but has no figures for it yet. If the company has reported, they'll show here once the feed catches up.">No figures yet</span> : <span className="chip">{c?.sec ? c.sec.split(" ")[0] : e.c || e.od ? "Unconfirmed" : PHASE_LABEL[e.h]}</span>}
      </span>
    </button>
  );
}

function groupBySession(evs: EarningsEvent[]) {
  const order: EarningsEvent["h"][] = ["bmo", "dmh", "amc", ""];
  const { dated } = splitClosed(evs);
  return order.map((h) => ({ h, list: dated.filter((e) => e.h === h) })).filter((g) => g.list.length);
}

// 0064: rows our feed projects onto a market holiday. Never counted as reporting, never under a session.
// 0072: so are past projections no report came out on (`od`).
function UnconfirmedGroup({ events, compact }: { events: EarningsEvent[]; compact?: boolean }) {
  const { unconfirmed } = splitClosed(events);
  if (!unconfirmed.length) return null;
  const holiday = unconfirmed.find((e) => e.c)?.c;
  const closedN = unconfirmed.filter((e) => e.c).length, passedN = unconfirmed.length - closedN;
  const why = (e: EarningsEvent) => e.c ? `our data feed projects ${e.c}, when markets are closed` : "our data feed expected a report this day, but none came out";
  if (compact) return (
    <div className="wsess" data-testid="unconfirmed-group">
      <span className="eyebrow sess-mini"><Phase h="" size={10} projected /> Date not confirmed</span>
      {unconfirmed.slice(0, 14).map((e) => (
        <button key={e.s} className="wrow wrow-projected" title={`${nameOf(e.s)}: ${why(e)}; date not confirmed`} onClick={() => setParam("t", e.s)} onMouseEnter={() => prefetchTicker(e.s)}>
          <Tile s={e.s} size={24} /><b>{e.s}</b><span className="muted">{epsIn(e.eE, curOf(e.s))}</span>
        </button>
      ))}
      {unconfirmed.length > 14 && <span className="muted small">+{unconfirmed.length - 14} more</span>}
    </div>
  );
  return (
    <section className="sess" data-testid="unconfirmed-group">
      <h3 className="sess-head"><Phase h="" size={14} projected /> <Term k="unconfirmed">Date not confirmed</Term> <span className="muted">· {unconfirmed.length}</span></h3>
      {closedN > 0 && <p className="muted small sess-note">Our data feed projects {closedN === 1 ? "this report" : "these reports"} on {holiday}, when markets are closed, so {closedN === 1 ? "it's" : "they're"} likely not the real date. The real date is probably a nearby trading day.</p>}
      {passedN > 0 && <p className="muted small sess-note" data-testid="overdue-note">Our data feed expected {passedN === 1 ? "this report" : "these reports"} on this day, but no results came out then, so {passedN === 1 ? "it isn't" : "they aren't"} counted as reporting. Check the company's own announcements for the real date.</p>}
      {unconfirmed.map((e) => <EventRow key={e.s} e={e} />)}
    </section>
  );
}

// The drawer has its own shareable URL (?day=), so an empty day there gets the same
// guidance as the grid, never a blank under "0 reporting" (0051, 0026).
type DrawerUnknown = "loading" | "failed" | "outside";
function drawerEmpty(day: string, unknown: DrawerUnknown | undefined, narrowed: boolean, unconfirmed = false) {
  const holiday = HOLIDAY[day];
  const dow = parse(day).getDay();
  if (holiday) return { eyebrow: "Market closed", body: unconfirmed ? <>Market closed · {holiday}. The exchanges are shut, so the dates below aren't confirmed.</> : <>Market closed · {holiday}. No companies report while the exchanges are shut.</> };
  if (dow === 0 || dow === 6) return { eyebrow: "Market closed", body: <>Market closed · weekend. Companies report on trading days.</> };
  if (unknown === "loading") return { eyebrow: "Loading", body: <>Charting the phases…</> };
  // A shared ?day= outside the range on screen: we haven't read it, so we don't claim anything.
  if (unknown === "outside") return { eyebrow: "Not on screen", body: <>This day isn't in the range on screen. Open the day view to see who reports.</> };
  if (unknown === "failed") return { eyebrow: "Didn't load", body: <>This day's earnings didn't load, so we can't say who reports. Try again in a moment.</> };
  // 0072: only rows that never happened here, so nothing is said to report, and nothing contradicts them.
  if (unconfirmed) return { eyebrow: "None confirmed", body: <>No report we follow is confirmed for {WEEKDAY_LONG[dow]}. The ones below were expected but didn't come out that day.</> };
  if (narrowed) return { eyebrow: "None with these filters", body: <>None with these filters report on {WEEKDAY_LONG[dow]}. Try <b>Everything</b>.</> };
  return { eyebrow: "None we follow", body: <><Term k="follow">{NONE_OURS}</Term> report on {WEEKDAY_LONG[dow]}. Smaller companies, and some listed only overseas, may.</> };
}

export function DayDrawer({ day, events, macro, onClose, unknown, checking = false }: { day: string; events: EarningsEvent[]; macro: MacroEvent[]; onClose: () => void; unknown?: DrawerUnknown; checking?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useDialog(ref, onClose);
  const { prefs } = useStore();
  const openDayView = () => { onClose(); actions.setPref("view", "day"); setParam("d", day); };
  // 0064: holiday rows aren't reporting that day, so a holiday with only those still reads "Market closed".
  const dated = splitClosed(events).dated;
  const empty = dated.length ? null : drawerEmpty(day, unknown, !["popular", "everything"].includes(prefs.filter) || !!prefs.sector, events.length > 0);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Earnings on ${fmtLong(day)}`}>
        <header className="drawer-head">
          <div>
            <span className="eyebrow">{empty ? empty.eyebrow : `${dated.length} reporting`}</span>
            <h2>{fmtLong(day)}</h2>
          </div>
          <div className="drawer-actions">
            <button className="cta cta-secondary sm" onClick={openDayView}>Open day view</button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        </header>
        {macro.map((m) => <Notice key={m.key}><b>{m.name}.</b> {m.blurb}</Notice>)}
        {(() => {
          const n = events.filter((e) => e.x === "differs").length;
          return n > 0 && <Notice><Term k="xcheck">{n === 1 ? "One date here isn't confirmed" : `${n} dates here aren't confirmed`}</Term>: Nasdaq's calendar lists {n === 1 ? "it" : "them"} on another day or time, marked “Nasdaq” below. Our feed and Nasdaq disagree, so check the company's own announcement.</Notice>;
        })()}
        {(() => {
          // 0007: dates the company hasn't announced (Nasdaq disagreements have their own note above).
          const n = dated.filter((e) => e.x !== "differs" && e.eA == null && eventProjected(e, todayISO())).length;
          return n > 0 && <Notice><Term k="unconfirmed">{n === 1 ? "One date here is projected" : n === dated.length ? "These dates are projected" : `${n} dates here are projected`}</Term>: {n === 1 ? "the company hasn't" : "the companies haven't"} announced {n === 1 ? "it" : "them"} yet, so {n === 1 ? "it" : "they"} can move. Marked “Projected date” below.</Notice>;
        })()}
        {empty && <p className="empty-big drawer-empty">{empty.body}</p>}
        {groupBySession(events).map((g) => (
          <section key={g.h} className="sess">
            <h3 className="sess-head"><Phase h={g.h} size={14} /> {sessionLabel(g.h, checking)} <span className="muted">· {g.list.length}</span></h3>
            {g.list.map((e) => <EventRow key={e.s} e={e} />)}
          </section>
        ))}
        <UnconfirmedGroup events={events} />
      </aside>
    </div>
  );
}

function FilterMenu({ counts, failed }: { counts: Record<string, number>; failed?: boolean }) {
  const none = failed ? "—" : "…";
  const { prefs } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f);
  }, []);
  const cur = FILTERS.find((f) => f.key === prefs.filter) ?? FILTERS[0];
  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-box" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {cur.label}{prefs.sector ? ` · ${prefs.sector}` : ""} · {counts[cur.key] ?? none} <Icon name="down" size={12} />
      </button>
      {open && (
        <div className="menu-pop">
          {FILTERS.map((f) => (
            <button key={f.key} className={`menu-item ${f.key === prefs.filter ? "on" : ""}`} onClick={() => { actions.setPref("filter", f.key); setOpen(false); }}>
              <span><b>{f.label}</b><span className="muted small">{f.hint}</span></span>
              <span className="eyebrow">{counts[f.key] ?? none}</span>
            </button>
          ))}
          <div className="menu-sep"><span className="eyebrow">Sector</span></div>
          <div className="menu-chips">
            <button className={`chip ${!prefs.sector ? "on" : ""}`} onClick={() => actions.setPref("sector", "")}>All</button>
            {SECTORS.map((s) => <button key={s} className={`chip ${prefs.sector === s ? "on" : ""}`} onClick={() => actions.setPref("sector", s)}>{s}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarPage({ onSearch }: { onSearch: () => void }) {
  useLocation();
  const { prefs } = useStore();
  const today = todayISO();
  const anchor = param("d") ?? nextTradingDay(today);
  const a = parse(anchor);
  const view = prefs.view;
  // Box Office: which way people read the calendar (month, week or one day, phase by phase).
  useEffect(() => { track("calendar_view", { view }); }, [view]);
  const weeks = useMemo(() => (view === "month" ? monthWeeks(a.getFullYear(), a.getMonth()) : [weekOf(anchor)]), [anchor, view]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][4];
  const { data, loading, error, retry, retrying } = useCalendar(view === "month" ? from : addDays(weekOf(anchor)[0], 0), view === "month" ? to : weekOf(anchor)[4], true);
  const macro = useMacro();
  const all = data?.events ?? [];
  const filtered = useFiltered(all);
  const store = useStore();
  const [openDay, setOpenDay] = useState<string | null>(param("day"));
  const next = nextTradingDay(today);
  const bWeek = useMemo(() => briefWeek(weeks, anchor), [weeks, anchor]);

  const inMonth = (d: string) => parse(d).getMonth() === a.getMonth();
  const monthEvents = view === "month" ? filtered.filter((e) => inMonth(e.d)) : filtered;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!data) return c; // unknown, not zero: a failed load must never read "· 0" (0026)
    // 0072/0064: a row that isn't a dated report (holiday projection, passed unreported) isn't counted.
    const scoped = (view === "month" ? all.filter((e) => inMonth(e.d)) : all).filter((e) => !unconfirmedRow(e));
    const watchSet = new Set(store.watch.map((w) => w.s));
    const direct = new Set(store.holdings.map((h) => h.s));
    c.popular = scoped.filter((e) => e.t).length;
    c.sp500 = scoped.filter((e) => UNIVERSE[e.s]?.sp).length;
    c.mega = scoped.filter((e) => (UNIVERSE[e.s]?.mc ?? 0) >= 200000).length;
    c.everything = scoped.length;
    c.watch = scoped.filter((e) => watchSet.has(e.s)).length;
    c.holdings = scoped.filter((e) => direct.has(e.s) || heldVia(e.s, store.holdings).length).length;
    return c;
  }, [data, all, store.watch, store.holdings, view, anchor]);

  // A day that didn't load is unknown, never "No earnings" (0026).
  // useApi keeps the previous range while the next one loads: a day outside it is unknown, not empty.
  const covered = (d: string) => !!data && data.from <= d && d <= data.to;
  const unknownDay = (d: string) => (covered(d) ? undefined : error ? "failed" as const : "loading" as const);
  const failedDays = useMemo(() => new Set(data ? missingDays(data.warnings ?? [], data.from, data.to) : []), [data]);
  // 0061: days on screen the Nasdaq cross-check hasn't reached yet (useApi re-reads until they're in).
  const unchecked = useMemo(() => new Set(data && !data.warnings.length ? checkingOf(data.uncheckedDays) : []), [data]);
  // Still checking only while a re-read is coming; after the last one, those times are the feed's alone.
  const checkingDays = retrying ? unchecked : new Set<string>();
  const byDay = useMemo(() => {
    const m: Record<string, EarningsEvent[]> = {};
    for (const e of filtered) (m[e.d] ??= []).push(e);
    return m;
  }, [filtered]);
  const macroByDay = useMemo(() => {
    const m: Record<string, MacroEvent[]> = {};
    for (const e of macro.data?.events ?? []) if (["jobs", "cpi", "fomc", "gdp", "pce"].includes(e.key)) (m[e.date] ??= []).push(e);
    return m;
  }, [macro.data]);

  const step = (dir: number) => {
    let d: string;
    if (view === "month") d = iso(new Date(a.getFullYear(), a.getMonth() + dir, 1));
    else if (view === "week") d = addDays(anchor, 7 * dir);
    else { d = addDays(anchor, dir); while (isWeekend(d)) d = addDays(d, dir); }
    setParam("d", d);
  };
  const openDrawer = (d: string) => { setOpenDay(d); history.replaceState(null, "", `${location.pathname}?${new URLSearchParams({ ...Object.fromEntries(new URL(location.href).searchParams), day: d })}`); };
  const closeDrawer = () => { setOpenDay(null); const u = new URL(location.href); u.searchParams.delete("day"); history.replaceState(null, "", u.pathname + u.search); };

  useEffect(() => {
    document.title = `${MONTHS[a.getMonth()]} earnings, phase by phase · Metaphases`;
  }, [anchor]);

  const label = view === "month" ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}` : view === "week" ? `Week of ${MON3[parse(weeks[0][0]).getMonth()]} ${parse(weeks[0][0]).getDate()}` : fmtLong(anchor).toUpperCase();
  const reported = monthEvents.filter((e) => e.eA != null);
  const datedCount = monthEvents.filter((e) => !unconfirmedRow(e)).length;
  const beats = reported.filter((e) => resultOf(e) === "beat").length;

  return (
    <>
      <HomeHero monthCount={view === "month" && data ? datedCount : null} monthLabel={`${MONTHS[a.getMonth()]} ${a.getFullYear()}`} />
      <div className="page-head">
        <div className="title-row">
          <h1 className="headline">
            {view === "day" ? fmtLong(anchor).split(",")[0] : MONTHS[a.getMonth()]} <em>earnings</em>.
          </h1>
          <p className="dek">
            {datedCount ? (
              <>
                <b>{datedCount}</b> companies report {view === "month" ? "this month" : view === "week" ? "this week" : "today"}
                {reported.length > 0 && <> · <b>{Math.round((beats / reported.length) * 100)}%</b> of those reported so far <Term k="beat">beat</Term> on both lines</>}
                . Tap any logo for the full read.
              </>
            ) : loading ? "Charting the phases…" : !data ? "The calendar didn't load, so we can't say who reports yet." : `${NONE_OURS} report ${view === "month" ? "this month" : view === "week" ? "this week" : "on this day"} with these filters.`}
          </p>
        </div>
        <div className="toolbar">
          <div className="tgroup">
            <FilterMenu counts={counts} failed={!!error && !data} />
            <AskWeekButton />
            <button className="btn btn-box sq" onClick={onSearch} title="Add a ticker to your watchlist" aria-label="Add ticker"><Icon name="plus" /></button>
            <button className={`btn btn-box sq ${prefs.tiles === "logo" ? "on" : ""}`} onClick={() => actions.setPref("tiles", "logo")} title="Show logos" aria-label="Show logos"><Icon name="image" /></button>
            <button className={`btn btn-box sq mono ${prefs.tiles === "ticker" ? "on" : ""}`} onClick={() => actions.setPref("tiles", "ticker")} title="Show tickers" aria-label="Show tickers">AB</button>
          </div>
          <div className="tgroup">
            <button className="btn btn-box sq" onClick={() => step(-1)} aria-label="Previous"><Icon name="left" /></button>
            <button className="btn btn-box on label" onClick={() => setParam("d", null)} title="Jump to today">{label}</button>
            <button className="btn btn-box sq" onClick={() => step(1)} aria-label="Next"><Icon name="right" /></button>
            {(["day", "week", "month"] as const).map((v) => (
              <button key={v} className={`btn btn-box sq ${view === v ? "on" : ""}`} onClick={() => actions.setPref("view", v)} title={`${v[0].toUpperCase()}${v.slice(1)} view`} aria-label={`${v} view`}><Icon name={v} /></button>
            ))}
          </div>
        </div>
      </div>

      <WeekBrief week={bWeek} current={bWeek.includes(next)} cal={data} calLoading={loading} calError={error} macro={macro.data} macroLoading={macro.loading} />

      {error && !loading && <Notice tone="error">{error} Your watchlist and holdings are safe. <button className="btn btn-box" onClick={retry}>Try again</button></Notice>}
      {data && data.warnings.length > 0 && (
        <Notice tone="warn">
          {failedDays.size === 0 ? "Part of the calendar didn't load yet — the market data service is busy." : failedDays.size === 1 ? `${fmtLong([...failedDays][0])} didn't load yet — the market data service is busy.` : `${failedDays.size} days didn't load yet — the market data service is busy.`} {retrying ? "Retrying in the background; everything else is current." : <>Everything else is current. <button className="link" onClick={retry}>Try again</button></>}
        </Notice>
      )}
      {unchecked.size > 0 && (() => {
        const which = unchecked.size === 1 ? `${WEEKDAY_LONG[parse([...unchecked][0]).getDay()]}'s` : `${unchecked.size} days'`;
        return retrying
          ? <Notice>Still comparing {which} dates and times with Nasdaq's calendar. A time or a <Term k="xcheck">“Nasdaq” note</Term> may fill in over the next few minutes.</Notice>
          : <Notice>We couldn't compare {which} dates and times with Nasdaq's calendar just now, so they're our data feed's alone. <button className="link" onClick={retry}>Check again</button></Notice>;
      })()}
      {data && !data.warnings.length && (data.pending ?? 0) > 0 && (
        <Notice>Some overseas companies' report dates are still being checked, so a few may be missing for now.</Notice>
      )}
      {prefs.filter === "holdings" && store.holdings.length === 0 && (
        <Notice>You haven't added holdings yet. <button className="link" onClick={() => navigate("/compass")}>Open Compass</button> to paste them in — funds count too.</Notice>
      )}

      {view === "day" ? (
        <DayView day={anchor} events={byDay[anchor] ?? []} checking={checkingDays.has(anchor)} loading={unknownDay(anchor) === "loading"} failed={unknownDay(anchor) === "failed" || failedDays.has(anchor)} macro={macroByDay[anchor] ?? []} />
      ) : (
        <div className={`grid ${view}`}>
          {WEEKDAYS.map((w, i) => <div key={w} className={`wd wd-${i}`}><span>{w}</span></div>)}
          {weeks.flat().map((d) =>
            loading && !data ? (
              <div key={d} className="cell"><Skeleton w={60} h={10} /><div className="cell-tiles"><Skeleton w={44} h={44} /><Skeleton w={44} h={44} /><Skeleton w={44} h={44} /></div></div>
            ) : view === "week" ? (
              <WeekColumn key={d} day={d} events={byDay[d] ?? []} checking={checkingDays.has(d)} loaded={covered(d)} failed={unknownDay(d) === "failed" || failedDays.has(d)} next={next} macro={macroByDay[d] ?? []} />
            ) : (
              <DayCell key={d} day={d} events={byDay[d] ?? []} unknown={unknownDay(d) ?? (failedDays.has(d) ? "failed" : undefined)} inMonth={inMonth(d)} today={today} next={next} macro={macroByDay[d] ?? []} onOpen={() => openDrawer(d)} />
            ),
          )}
        </div>
      )}
      {openDay && <DayDrawer day={openDay} events={byDay[openDay] ?? []} checking={checkingDays.has(openDay)} unknown={covered(openDay) ? (failedDays.has(openDay) ? "failed" : undefined) : error ? "failed" : loading ? "loading" : "outside"} macro={macroByDay[openDay] ?? []} onClose={closeDrawer} />}
    </>
  );
}

function WeekColumn({ day, events, next, macro, failed, loaded, checking = false }: { day: string; events: EarningsEvent[]; next: string; macro: MacroEvent[]; failed?: boolean; loaded?: boolean; checking?: boolean }) {
  const d = parse(day);
  const dated = splitClosed(events).dated.length;
  return (
    <div className={`wcol ${day === next ? "next" : ""}`}>
      <div className="cell-head"><span className="cell-date">{MON3[d.getMonth()]} <b>{String(d.getDate()).padStart(2, "0")}</b></span>{!failed && !(HOLIDAY[day] && !dated) && <span className="cell-count">{dated}</span>}</div>
      {macro.map((m) => <span key={m.key} className={`mtag kind-${m.kind}`}>{m.name}</span>)}
      {HOLIDAY[day] && <span className="empty-tag">Market closed · {HOLIDAY[day]}</span>}
      {failed && !HOLIDAY[day] && !events.length && <span className="empty-tag unknown-tag">Didn't load</span>}
      {loaded && !failed && !HOLIDAY[day] && !events.length && <EmptyTag />}
      {groupBySession(events).map((g) => (
        <div key={g.h} className="wsess">
          <span className="eyebrow sess-mini"><Phase h={g.h} size={10} /> {sessionLabel(g.h, checking)}</span>
          {g.list.slice(0, 14).map((e) => (
            <button key={e.s} className={`wrow ${resultOf(e) ? `res-${resultOf(e)}` : ""}${e.eA == null && e.x !== "differs" && eventProjected(e, todayISO()) ? " wrow-projected" : ""}`} title={e.eA == null && e.x !== "differs" && eventProjected(e, todayISO()) ? `${nameOf(e.s)}: date not confirmed by the company yet` : undefined} onClick={() => setParam("t", e.s)} onMouseEnter={() => prefetchTicker(e.s)}>
              <Tile s={e.s} size={24} /><b>{e.s}</b><span className="muted">{epsIn(e.eA ?? e.eE, curOf(e.s))}</span>
            </button>
          ))}
          {g.list.length > 14 && <span className="muted small">+{g.list.length - 14} more</span>}
        </div>
      ))}
      <UnconfirmedGroup events={events} compact />
    </div>
  );
}

function DayView({ day, events, loading, macro, failed, checking = false }: { day: string; events: EarningsEvent[]; loading: boolean; macro: MacroEvent[]; failed?: boolean; checking?: boolean }) {
  const { prefs } = useStore();
  const narrowed = prefs.filter !== "everything" || !!prefs.sector;
  const wd = WEEKDAY_LONG[parse(day).getDay()];
  if (loading) return <div className="dayview">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={52} />)}</div>;
  return (
    <div className="dayview">
      {macro.map((m) => <Notice key={m.key}><b>{m.name}.</b> {m.blurb}</Notice>)}
      {HOLIDAY[day] && <Notice>Markets are closed for {HOLIDAY[day]}.</Notice>}
      {!events.length && !HOLIDAY[day] && (failed
        ? <p className="empty-big">This day's earnings didn't load, so we can't say who reports. Try again in a moment.</p>
        : <p className="empty-big"><Term k="follow">{NONE_OURS}</Term> report on {wd}{narrowed ? <> with these filters. Try <b>Everything</b>.</> : <>. Smaller companies, and some listed only overseas, may.</>}</p>)}
      {groupBySession(events).map((g) => (
        <section key={g.h} className="sess">
          <h3 className="sess-head"><Phase h={g.h} size={14} /> {sessionLabel(g.h, checking)} <span className="muted">· {g.list.length}</span></h3>
          {g.list.map((e) => <EventRow key={e.s} e={e} />)}
        </section>
      ))}
      <UnconfirmedGroup events={events} />
    </div>
  );
}
