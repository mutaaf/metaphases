import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsEvent, MacroEvent } from "../../shared/types";
import { EARLY_CLOSE, HOLIDAYS } from "../../shared/market";
import { useCalendar, useMacro, prefetchTicker } from "../lib/api";
import { co, heldVia, nameOf, popularity, resultOf, SECTORS, surprise, UNIVERSE } from "../lib/data";
import { addDays, fmtLong, iso, MONTHS, MON3, monthWeeks, parse, todayISO, weekOf, WEEKDAYS, isWeekend } from "../lib/dates";
import { eps, money, pct } from "../lib/format";
import { navigate, param, setParam, useLocation } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { Icon, Notice, Phase, PHASE_LABEL, Skeleton, Term, Tile } from "./bits";

const HOLIDAY = Object.fromEntries(HOLIDAYS.map((h) => [h.date, h.name]));
const PER_CELL = 3;

export const FILTERS: { key: string; label: string; hint: string }[] = [
  { key: "popular", label: "Most popular", hint: "The ~650 companies investors watch most" },
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
  return (
    <button
      className={`tbtn ${r ? `res-${r}` : ""}`}
      onClick={(ev) => { ev.stopPropagation(); setParam("t", e.s); }}
      onMouseEnter={() => prefetchTicker(e.s)}
      title={`${nameOf(e.s)} (${e.s}) · ${PHASE_LABEL[e.h]}${e.eE != null ? ` · est. ${eps(e.eE)}` : ""}${r ? ` · ${r.toUpperCase()}` : ""}`}
    >
      <Tile s={e.s} size={size} />
      <span className="tbtn-phase"><Phase h={e.h} size={11} /></span>
      {starred && <span className="tbtn-star" aria-label="On your watchlist" />}
    </button>
  );
}

function DayCell({ day, events, inMonth, today, next, macro, onOpen }: { day: string; events: EarningsEvent[]; inMonth: boolean; today: string; next: string; macro: MacroEvent[]; onOpen: () => void }) {
  const d = parse(day);
  const holiday = HOLIDAY[day];
  const isNext = day === next;
  const past = day < today;
  const reported = events.filter((e) => e.eA != null).length;
  return (
    <div className={`cell ${inMonth ? "" : "out"} ${isNext ? "next" : ""} ${past ? "past" : ""} ${holiday ? "holiday" : ""}`} onClick={events.length ? onOpen : undefined} role={events.length ? "button" : undefined} tabIndex={events.length ? 0 : -1} onKeyDown={(e) => e.key === "Enter" && events.length && onOpen()}>
      <div className="cell-head">
        {isNext ? (
          <span className="next-badge"><i />{MON3[d.getMonth()]} {String(d.getDate()).padStart(2, "0")} · {day === today ? "Today" : "Next trading day"}</span>
        ) : (
          <span className="cell-date"><span className="cell-wd">{WEEKDAYS[(d.getDay() + 6) % 7]} · </span>{MON3[d.getMonth()]} <b>{String(d.getDate()).padStart(2, "0")}</b></span>
        )}
        {events.length > 0 && !isNext && <span className="cell-count">{String(events.length).padStart(2, "0")}</span>}
      </div>
      {macro.length > 0 && (
        <div className="cell-macro">{macro.map((m) => <span key={m.key} className={`mtag kind-${m.kind}`} title={m.blurb}>{m.name}</span>)}</div>
      )}
      {holiday ? (
        <span className="empty-tag">Market closed · {holiday}</span>
      ) : events.length === 0 ? (
        inMonth ? <span className="empty-tag">No earnings</span> : null
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
  return (
    <button className="erow" onClick={() => setParam("t", e.s)} onMouseEnter={() => prefetchTicker(e.s)}>
      <Tile s={e.s} size={34} />
      <span className="erow-id">
        <b>{e.s}</b>
        <span className="muted">{nameOf(e.s)}</span>
      </span>
      {showDate && <span className="eyebrow">{fmtLong(e.d).split(",")[0]}</span>}
      <span className="erow-num"><span className="eyebrow">EPS est</span>{eps(e.eE)}</span>
      <span className="erow-num"><span className="eyebrow">{e.eA != null ? "Actual" : "Rev est"}</span>{e.eA != null ? eps(e.eA) : money(e.rE)}</span>
      <span className="erow-res">
        {r ? <span className={`chip res-${r}`}>{r}{s != null ? ` ${pct(s, 0)}` : ""}</span> : <span className="chip">{c?.sec ? c.sec.split(" ")[0] : PHASE_LABEL[e.h]}</span>}
      </span>
    </button>
  );
}

function groupBySession(evs: EarningsEvent[]) {
  const order: EarningsEvent["h"][] = ["bmo", "dmh", "amc", ""];
  return order.map((h) => ({ h, list: evs.filter((e) => e.h === h) })).filter((g) => g.list.length);
}

export function DayDrawer({ day, events, macro, onClose }: { day: string; events: EarningsEvent[]; macro: MacroEvent[]; onClose: () => void }) {
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label={`Earnings on ${fmtLong(day)}`}>
        <header className="drawer-head">
          <div>
            <span className="eyebrow">{events.length} reporting</span>
            <h2>{fmtLong(day)}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        {macro.map((m) => <Notice key={m.key}><b>{m.name}.</b> {m.blurb}</Notice>)}
        {groupBySession(events).map((g) => (
          <section key={g.h} className="sess">
            <h3 className="sess-head"><Phase h={g.h} size={14} /> {PHASE_LABEL[g.h]} <span className="muted">· {g.list.length}</span></h3>
            {g.list.map((e) => <EventRow key={e.s} e={e} />)}
          </section>
        ))}
      </aside>
    </div>
  );
}

function FilterMenu({ counts }: { counts: Record<string, number> }) {
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
        {cur.label}{prefs.sector ? ` · ${prefs.sector}` : ""} · {counts[cur.key] ?? "…"} <Icon name="down" size={12} />
      </button>
      {open && (
        <div className="menu-pop">
          {FILTERS.map((f) => (
            <button key={f.key} className={`menu-item ${f.key === prefs.filter ? "on" : ""}`} onClick={() => { actions.setPref("filter", f.key); setOpen(false); }}>
              <span><b>{f.label}</b><span className="muted small">{f.hint}</span></span>
              <span className="eyebrow">{counts[f.key] ?? 0}</span>
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
  const weeks = useMemo(() => (view === "month" ? monthWeeks(a.getFullYear(), a.getMonth()) : [weekOf(anchor)]), [anchor, view]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][4];
  const { data, loading, error } = useCalendar(view === "month" ? from : addDays(weekOf(anchor)[0], 0), view === "month" ? to : weekOf(anchor)[4]);
  const macro = useMacro();
  const all = data?.events ?? [];
  const filtered = useFiltered(all);
  const store = useStore();
  const [openDay, setOpenDay] = useState<string | null>(param("day"));
  const next = nextTradingDay(today);

  const inMonth = (d: string) => parse(d).getMonth() === a.getMonth();
  const monthEvents = view === "month" ? filtered.filter((e) => inMonth(e.d)) : filtered;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    const scoped = view === "month" ? all.filter((e) => inMonth(e.d)) : all;
    const watchSet = new Set(store.watch.map((w) => w.s));
    const direct = new Set(store.holdings.map((h) => h.s));
    c.popular = scoped.filter((e) => e.t).length;
    c.sp500 = scoped.filter((e) => UNIVERSE[e.s]?.sp).length;
    c.mega = scoped.filter((e) => (UNIVERSE[e.s]?.mc ?? 0) >= 200000).length;
    c.everything = scoped.length;
    c.watch = scoped.filter((e) => watchSet.has(e.s)).length;
    c.holdings = scoped.filter((e) => direct.has(e.s) || heldVia(e.s, store.holdings).length).length;
    return c;
  }, [all, store.watch, store.holdings, view, anchor]);

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
  const beats = reported.filter((e) => resultOf(e) === "beat").length;

  return (
    <>
      <div className="page-head">
        <div className="title-row">
          <h1 className="headline">
            {view === "day" ? fmtLong(anchor).split(",")[0] : MONTHS[a.getMonth()]} <em>earnings</em>.
          </h1>
          <p className="dek">
            {monthEvents.length ? (
              <>
                <b>{monthEvents.length}</b> companies report {view === "month" ? "this month" : view === "week" ? "this week" : "today"}
                {reported.length > 0 && <> · <b>{Math.round((beats / reported.length) * 100)}%</b> of those reported so far <Term k="beat">beat</Term> on both lines</>}
                . Tap any logo for the full read.
              </>
            ) : loading ? "Charting the phases…" : "A quiet stretch — nothing reports with these filters."}
          </p>
        </div>
        <div className="toolbar">
          <div className="tgroup">
            <FilterMenu counts={counts} />
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

      {error && <Notice tone="error">{error} Your watchlist and holdings are safe — pull to retry.</Notice>}
      {data && data.warnings.length > 0 && (
        <Notice tone="warn">
          {data.warnings.length === 1 ? data.warnings[0] : `${data.warnings.length} days didn't load yet — the market data service is busy.`} Retrying in the background; everything else is current.
        </Notice>
      )}
      {prefs.filter === "holdings" && store.holdings.length === 0 && (
        <Notice>You haven't added holdings yet. <button className="link" onClick={() => navigate("/compass")}>Open Compass</button> to paste them in — funds count too.</Notice>
      )}

      {view === "day" ? (
        <DayView day={anchor} events={byDay[anchor] ?? []} loading={loading} macro={macroByDay[anchor] ?? []} />
      ) : (
        <div className={`grid ${view}`}>
          {WEEKDAYS.map((w, i) => <div key={w} className={`wd wd-${i}`}><span>{w}</span></div>)}
          {weeks.flat().map((d) =>
            loading && !data ? (
              <div key={d} className="cell"><Skeleton w={60} h={10} /><div className="cell-tiles"><Skeleton w={44} h={44} /><Skeleton w={44} h={44} /><Skeleton w={44} h={44} /></div></div>
            ) : view === "week" ? (
              <WeekColumn key={d} day={d} events={byDay[d] ?? []} next={next} macro={macroByDay[d] ?? []} />
            ) : (
              <DayCell key={d} day={d} events={byDay[d] ?? []} inMonth={inMonth(d)} today={today} next={next} macro={macroByDay[d] ?? []} onOpen={() => openDrawer(d)} />
            ),
          )}
        </div>
      )}
      {openDay && <DayDrawer day={openDay} events={byDay[openDay] ?? []} macro={macroByDay[openDay] ?? []} onClose={closeDrawer} />}
    </>
  );
}

function WeekColumn({ day, events, next, macro }: { day: string; events: EarningsEvent[]; next: string; macro: MacroEvent[] }) {
  const d = parse(day);
  return (
    <div className={`wcol ${day === next ? "next" : ""}`}>
      <div className="cell-head"><span className="cell-date">{MON3[d.getMonth()]} <b>{String(d.getDate()).padStart(2, "0")}</b></span><span className="cell-count">{events.length}</span></div>
      {macro.map((m) => <span key={m.key} className={`mtag kind-${m.kind}`}>{m.name}</span>)}
      {HOLIDAY[day] && <span className="empty-tag">Market closed · {HOLIDAY[day]}</span>}
      {groupBySession(events).map((g) => (
        <div key={g.h} className="wsess">
          <span className="eyebrow sess-mini"><Phase h={g.h} size={10} /> {PHASE_LABEL[g.h]}</span>
          {g.list.slice(0, 14).map((e) => (
            <button key={e.s} className={`wrow ${resultOf(e) ? `res-${resultOf(e)}` : ""}`} onClick={() => setParam("t", e.s)} onMouseEnter={() => prefetchTicker(e.s)}>
              <Tile s={e.s} size={24} /><b>{e.s}</b><span className="muted">{eps(e.eA ?? e.eE)}</span>
            </button>
          ))}
          {g.list.length > 14 && <span className="muted small">+{g.list.length - 14} more</span>}
        </div>
      ))}
    </div>
  );
}

function DayView({ day, events, loading, macro }: { day: string; events: EarningsEvent[]; loading: boolean; macro: MacroEvent[] }) {
  if (loading) return <div className="dayview">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={52} />)}</div>;
  return (
    <div className="dayview">
      {macro.map((m) => <Notice key={m.key}><b>{m.name}.</b> {m.blurb}</Notice>)}
      {HOLIDAY[day] && <Notice>Markets are closed for {HOLIDAY[day]}.</Notice>}
      {!events.length && !HOLIDAY[day] && <p className="empty-big">No earnings with these filters. Try <b>Everything</b>.</p>}
      {groupBySession(events).map((g) => (
        <section key={g.h} className="sess">
          <h3 className="sess-head"><Phase h={g.h} size={14} /> {PHASE_LABEL[g.h]} <span className="muted">· {g.list.length}</span></h3>
          {g.list.map((e) => <EventRow key={e.s} e={e} />)}
        </section>
      ))}
    </div>
  );
}
