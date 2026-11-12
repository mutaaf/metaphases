import { useEffect } from "react";
import { useTicker } from "../lib/api";
import { nameOf } from "../lib/data";
import { daysBetween, fmtShort, todayISO } from "../lib/dates";
import { navigate, setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { GradeBadge, Icon, Phase, Skeleton, Term, Tile } from "../components/bits";
import { PageHero } from "../components/Hero";
import { IcsButtons } from "../components/Depth";
import { isDated } from "../../shared/pending";

export const POPULAR = ["AAPL", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "TSLA", "NFLX"];

function WatchRow({ s, buy, note }: { s: string; buy?: number; note?: string }) {
  const { data, loading } = useTicker(s);
  const today = todayISO();
  const n = isDated(data?.next) ? daysBetween(today, data.next.date) : null;
  const below = buy && data?.quote ? data.quote.price <= buy : false;
  return (
    <button className={`wl-row ${below ? "alert" : ""}`} onClick={() => setParam("t", s)} aria-label={`${nameOf(s)}${data?.justReported ? ", just reported" : data?.next?.status === "results-pending" ? ", results expected, none in yet" : data?.next ? (data.next.closed || data.next.overdue ? ", report date not confirmed" : data.next.projected && !data.next.nasdaq ? `, expected around ${fmtShort(data.next.date)}, date not confirmed` : `, reports ${fmtShort(data.next.date)}`) : ""}${below ? ", at or below your buy price" : ""}`}>
      <Tile s={s} size={44} />
      <span className="wl-id"><b>{s}</b><span className="muted">{data?.profile?.name ?? nameOf(s)}</span>{note && <span className="wl-note">“{note}”</span>}</span>
      <span className="wl-next">
        {loading && !data ? <Skeleton w={90} /> : data?.justReported ? <span className="muted small">Reported {data.justReported.date === today ? "today" : fmtShort(data.justReported.date)}</span> : data?.next?.status === "results-pending" ? <span className="muted small">Results expected, none in yet</span> : data?.next?.closed || data?.next?.overdue ? <span className="muted small">Date not confirmed</span> : data?.next ? (
          <><Phase h={data.next.session} size={14} projected={!!data.next.projected && !data.next.nasdaq} /> <span><b>{data.next.projected && !data.next.nasdaq ? "~" : ""}{fmtShort(data.next.date)}</b><span className="eyebrow">{n === 0 ? "today" : `in ${n}d`}</span></span></>
        ) : <span className="muted small">No date yet</span>}
      </span>
      <span className="wl-num"><span className="eyebrow">Price</span>{data?.quote ? `$${data.quote.price.toFixed(2)}` : "—"}</span>
      <span className="wl-num"><span className="eyebrow">Buy below</span>{buy ? `$${buy.toFixed(2)}` : "—"}</span>
      <span className="wl-grades"><GradeBadge g={data?.setup.grade ?? null} size="sm" /><GradeBadge g={data?.compass.grade ?? null} size="sm" /></span>
    </button>
  );
}

/** One-tap starter chips: star a popular company without searching. */
export function PopularChips({ label = "Popular:" }: { label?: string }) {
  const { watch } = useStore();
  return (
    <div className="chip-row" aria-label="Popular companies">
      <span className="eyebrow">{label}</span>
      {POPULAR.map((s) => {
        const on = watch.some((w) => w.s === s);
        return (
          <button key={s} className={`chip chip-star ${on ? "on" : ""}`} aria-pressed={on} onClick={() => actions.toggleWatch(s)}>
            <Icon name="star" size={11} /> {s}
          </button>
        );
      })}
    </div>
  );
}

export default function WatchlistPage({ onSearch }: { onSearch: () => void }) {
  const { watch } = useStore();
  useEffect(() => { document.title = "Your watchlist, in phases · Metaphases"; }, []);
  return (
    <div className="page">
      <PageHero
        eyebrow={`Watchlist · ${watch.length} ${watch.length === 1 ? "company" : "companies"}`}
        title={<>Your <em>watchlist</em>.</>}
        dek={<>Every name you're tracking, when it reports next, and whether it's under your buy price. Grades: <Term k="setup">setup</Term> · <Term k="compass">Compass</Term>.</>}
        primary={{ label: "Add a company", onClick: onSearch, icon: "plus" }}
        secondary={{ label: "Filter the calendar to these", onClick: () => { actions.setPref("filter", "watch"); navigate("/"); } }}
      />
      {watch.length === 0 ? (
        <section className="empty-cta">
          <span className="empty-moon"><Phase h="" size={44} /></span>
          <h2>Nothing in orbit yet.</h2>
          <p className="muted">Star a company and Metaphases tracks its next report, its setup and how far it is from your buy price.</p>
          <button className="cta cta-primary" onClick={onSearch}><Icon name="star" size={14} /> Star your first company</button>
          <PopularChips label="Or one tap:" />
        </section>
      ) : (
        <>
          <div className="wl">{watch.map((w) => <WatchRow key={w.s} s={w.s} buy={w.buy} note={w.note} />)}</div>
          <PopularChips label="Add a popular one:" />
          <IcsButtons symbols={watch.map((w) => w.s)} />
        </>
      )}
    </div>
  );
}
