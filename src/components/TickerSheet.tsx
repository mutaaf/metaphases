import { epsVerdict, vsExpected } from "../../shared/compare";
import { useEffect, useRef, useState } from "react";
import type { Factor, Reaction, TickerResponse } from "../../shared/types";
import { useTicker } from "../lib/api";
import { co, curOf, heldVia, nameOf, ETF_ASOF } from "../lib/data";
import { daysBetween, fmtLong, todayISO } from "../lib/dates";
import { currencyName, eps, epsIn, isUsd, mcap, money, moneyIn, pct } from "../lib/format";
import { actions, useStore } from "../lib/store";
import { BASE } from "../lib/router";
import { AiPreviewMount } from "./ai/mount";
import { useDialog } from "../lib/dialog";
import { IcsButtons, Peers, PriceChart, QuarterTrend } from "./Depth";
import { whatTheyDo } from "../lib/plain";
import { isEveryday, LensNote } from "./Everyday";
import { navigate } from "../lib/router";
import { isDated } from "../../shared/pending";
import { nextTimeContested, shownSession } from "../../shared/contestedTime";
import { Bar, GradeBadge, Icon, Notice, Phase, PHASE_LABEL, share, Skeleton, Spark, Term, Tile } from "./bits";
const SESSION_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "at another time" };

/** 0039: a report that's out, said plainly before the next one. */
function JustReported({ j, today }: { j: NonNullable<TickerResponse["justReported"]>; today: string }) {
  // 0049: one EPS judgment everywhere; an actual on another basis from its estimate isn't a beat or a miss.
  const jv = epsVerdict({ eA: j.epsA, eE: j.epsE, nE: j.nE, nA: j.nA, reit: j.reit });
  const s = jv.pct;
  const verdict = jv.v === "not-comparable" ? "Different basis" : jv.v && s == null ? (jv.v === "beat" ? "Above the estimate" : "Below the estimate") : s == null ? null : Math.abs(s) < 0.5 ? "In line with the estimate" : s > 0 ? `Beat by ${s.toFixed(0)}%` : `Missed by ${Math.abs(s).toFixed(0)}%`;
  return (
    <section className="just-reported" aria-label={`Reported Q${j.quarter} ${j.year}`}>
      <span className="eyebrow">Just reported · Q{j.quarter} {j.year}</span>
      <h3>{j.date === today ? "Today" : fmtLong(j.date)}{j.session && <>, <Term k={j.session}>{PHASE_LABEL[j.session].toLowerCase()}</Term></>}</h3>
      <dl className="nc-stats">
        <div><dt>EPS</dt><dd>{epsIn(j.epsA, j.currency)}</dd></div>
        <div><dt><Term k="consensus">{jv.via ? "Expected (Nasdaq)" : "Expected"}</Term></dt><dd>{epsIn(jv.via ? jv.est : j.epsE, j.currency)}</dd></div>
        <div><dt><Term k="surprise">Result</Term></dt><dd className={s == null || Math.abs(s) < 0.5 ? "" : s > 0 ? "pos" : "neg"}>{verdict ?? (j.epsA == null ? "Figures not in yet" : "—")}</dd></div>
      </dl>
      {jv.act != null && <p className="muted small rx-basis" data-testid="jr-pair">{epsIn(j.epsA, j.currency)} is our data feed's figure. On the estimate's basis (Nasdaq's figures) it was {epsIn(jv.act, j.currency)} against {epsIn(jv.est, j.currency)}, and that's the result shown.</p>}
      {jv.v === "not-comparable" && <p className="muted small rx-basis" data-testid="jr-basis"><Term k="epsbasis">EPS basis differs from the estimate</Term> (for example FFO or adjusted earnings against net income), so we don't call it a beat or a miss.</p>}
    </section>
  );
}

function FactorList({ factors }: { factors: Factor[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="factors">
      {factors.map((f) => (
        <li key={f.key} className={open === f.key ? "open" : ""}>
          <button className="factor-row" onClick={() => setOpen(open === f.key ? null : f.key)} aria-expanded={open === f.key}>
            <span className="f-label">{f.label}</span>
            <Bar value={f.score} tone={f.score == null ? "" : f.score >= 70 ? "good" : f.score >= 50 ? "ok" : "bad"} />
            <GradeBadge g={f.grade} size="sm" />
          </button>
          <p className="f-why">{f.why}</p>
          {open === f.key && (
            <dl className="f-inputs">
              {f.inputs.map((i) => (
                <div key={i.label}><dt>{i.term ? <Term k={i.term}>{i.label}</Term> : i.label}</dt><dd>{i.value}</dd></div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

function Reactions({ history, expected, usd }: { history: Reaction[]; expected: number | null; usd: boolean }) {
  const rows = [...history].reverse();
  const max = Math.max(4, ...rows.map((r) => Math.abs(r.move ?? 0)));
  return (
    <div className="reactions">
      <div className="rx-chart" role="img" aria-label="Stock price reaction to recent reports">
        {expected != null && <><span className="rx-band" style={{ height: `${(expected / max) * 50}%`, bottom: "50%" }} /><span className="rx-band" style={{ height: `${(expected / max) * 50}%`, top: "50%" }} /></>}
        {rows.map((r) => {
          const beat = r.epsA != null && r.epsE != null && !r.basis ? r.epsA >= r.epsE : null;
          const h = r.move == null ? 0 : (Math.abs(r.move) / max) * 50;
          return (
            <div key={r.date} className="rx-col" title={`${r.period}: ${r.move == null ? (r.session ? "no price data" : "report time unknown, so no move") : pct(r.move)} · EPS ${eps(r.epsA)} vs ${eps(r.epsE)}`}>
              <span className={`rx-bar ${r.move != null && r.move >= 0 ? "up" : "down"}`} style={{ height: `${h}%`, [r.move != null && r.move >= 0 ? "bottom" : "top"]: "50%" }} />
              <span className="rx-val">{r.move == null ? "—" : pct(r.move, 1)}</span>
              <span className={`rx-dot ${beat == null ? "" : beat ? "res-beat" : "res-miss"}`} />
              <span className="rx-q">{r.period.replace(/(\w{3}) (\d{2})(\d{2})/, "$1 ’$3")}</span>
            </div>
          );
        })}
      </div>
      <table className="rx-table">
        <thead><tr><th>Reported</th><th><Term k="eps">EPS</Term> est → actual</th><th><Term k="surprise">Surprise</Term></th><th><Term k="reaction">Move</Term></th></tr></thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.date}>
              <td><Phase h={r.session} size={10} /> {r.date.length === 10 ? `${new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} ’${r.date.slice(2, 4)}` : r.period}</td>
              <td>{eps(r.epsE)} → <b>{eps(r.epsA)}</b></td>
              <td className={r.surprisePct == null ? "" : r.surprisePct >= 0 ? "pos" : "neg"}>{r.basis ? <span className="muted" title="The actual isn't on the same basis as the estimate">basis differs</span> : pct(r.surprisePct)}</td>
              <td className={r.move == null ? "" : r.move >= 0 ? "pos" : "neg"}>{pct(r.move)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.some((r) => r.basis) && <p className="muted small rx-basis" data-testid="rx-epsbasis">"basis differs": <Term k="epsbasis">EPS basis differs from the estimate</Term> (for example FFO against net income, or a per-ADR figure against a per-share one), so that quarter isn't a beat or a miss and isn't in the beat record.</p>}
      {history.some((r) => r.move == null && !r.session && r.date.length === 10) && <p className="muted small rx-basis">"—" means no feed says whether that report came before the open or after the close, so we don't guess which day it moved.</p>}
      <p className="muted small rx-basis">{usd && "Estimates use the calendar's consensus wherever we have it for that quarter. "}Actuals are usually <Term k="adjustedeps">adjusted EPS</Term>, the figure analysts forecast, so they can differ from the profit in the company's filings.</p>
    </div>
  );
}

function Street({ s }: { s: NonNullable<TickerResponse["street"]> }) {
  const t = s.buy + s.hold + s.sell || 1;
  return (
    <div className="street">
      <div className="street-bar">
        <span className="sb-buy" style={{ flex: s.buy }}>{s.buy > 0 && `${Math.round((s.buy / t) * 100)}% buy`}</span>
        <span className="sb-hold" style={{ flex: s.hold }}>{s.hold > 0 && `${s.hold}`}</span>
        <span className="sb-sell" style={{ flex: s.sell }}>{s.sell > 0 && `${s.sell}`}</span>
      </div>
      <p className="muted small">
        {s.buy} buy · {s.hold} hold · {s.sell} sell across {t} analysts
        {s.buyPctChange3m != null && Math.abs(s.buyPctChange3m) >= 1 && <> — {s.buyPctChange3m > 0 ? "warming" : "cooling"} by {Math.abs(s.buyPctChange3m).toFixed(0)} pts over three months</>}.
      </p>
    </div>
  );
}

export function TickerSheet({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { data, loading, error, retry } = useTicker(symbol);
  const { watch, holdings, prefs } = useStore();
  const everyday = isEveryday(prefs.lens);
  const [traderDetails, setTraderDetails] = useState(false);
  const showTrader = !everyday || traderDetails;
  const [copied, setCopied] = useState(false);
  const w = watch.find((x) => x.s === symbol);
  const c = co(symbol);
  const name = data?.profile?.name ?? nameOf(symbol);
  const estCur = data?.next?.currency ?? curOf(symbol);
  // Market value: a tracked company's comes from the universe, in dollars (0042). Finnhub's profile figure is
  // in the profiled listing's currency and its label can be wrong (SQM "USD" 15.1T pesos, BABA "CNY" in USD).
  const via = heldVia(symbol, holdings);
  const direct = holdings.find((h) => h.s === symbol);
  const today = todayISO();
  // 0007: the feed's projection (a Nasdaq disagreement has its own note and wins).
  const proj = !!data?.next?.projected && !data?.next?.nasdaq && !data?.next?.closed;
  // 0062: same date, different sessions on the two calendars: headline neither session as fact.
  const contested = nextTimeContested(data?.next);
  const sheetRef = useRef<HTMLElement>(null);
  useDialog(sheetRef, onClose, { initialFocus: "self" });

  useEffect(() => {
    const prev = document.title;
    document.title = `${symbol} earnings: the full read · Metaphases`;
    return () => { document.title = prev; };
  }, [symbol]);

  const up = (data?.quote?.changePct ?? 0) >= 0;
  const nextIn = isDated(data?.next) ? daysBetween(today, data.next.date) : null;
  const just = data?.justReported;
  const due = data?.next?.status === "results-pending";
  const shareText = just
    ? `${name} reported Q${just.quarter}${just.epsA != null ? `: ${epsIn(just.epsA, just.currency)} a share${just.epsE != null ? vsExpected(just, (v) => epsIn(v, just.currency)) : ""}` : ""}.`
    : due ? `${name}'s Q${data!.next!.quarter} results were expected; none are in yet.`
    : data?.next?.closed || data?.next?.overdue
    ? `${name}: report date not confirmed yet — earnings track record, quality grade and setup.`
    : data?.next
    ? `${name} reports ${nextIn === 0 ? "today" : nextIn === 1 ? "tomorrow" : `in ${nextIn} days`}${data.next.nasdaq ? (data.next.nasdaq.date === data.next.date ? " (time unconfirmed)" : " (date unconfirmed)") : ""} — ${data.beatRate ? `beat ${data.beatRate.beats} of its last ${data.beatRate.total}` : "see the setup"}${data.expectedMove ? `, typical move ±${data.expectedMove.toFixed(1)}%` : ""}.`
    : `${name}: earnings track record, quality grade and setup.`;
  const doShare = () => share(`${symbol} on Metaphases`, shareText, `${location.origin}${BASE}/t/${symbol}`, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer sheet" ref={sheetRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${name} earnings`}>
        <header className="sheet-head">
          <Tile s={symbol} size={56} force="logo" />
          <div className="sheet-id">
            <span className="eyebrow">{symbol} · {data?.profile?.industry || c?.sec || "—"}{c ? (c.mc > 0 ? ` · ${mcap(c.mc)}` : "") : data?.profile?.marketCap && (isUsd(estCur) || !isUsd(data.profile.currency)) ? ` · ${moneyIn(data.profile.marketCap * 1e6, data.profile.currency)}` : ""}</span>
            <h2>{name}</h2>
            {everyday && <p className="sheet-does">{whatTheyDo(name, data?.profile?.industry ?? c?.ind)}</p>}
            {data?.quote ? (
              <span className="quote"><b>${data.quote.price.toFixed(2)}</b> <span className={up ? "pos" : "neg"}>{pct(data.quote.changePct, 2)}</span> <Spark data={data.spark} w={90} h={22} /></span>
            ) : loading ? <Skeleton w={160} h={18} /> : null}
          </div>
          <div className="sheet-actions">
            <button className={`btn btn-box ${w ? "on" : ""}`} onClick={() => actions.toggleWatch(symbol)} aria-pressed={!!w}><Icon name="star" size={14} /> {w ? "Watching" : "Watch"}</button>
            {data?.next && !data.next.overdue && !due && <IcsButtons symbols={[symbol]} compact />}
            <button className="btn btn-box sq" onClick={doShare} aria-label={`Share ${symbol}'s read`}><Icon name="share" size={14} /></button>
            <button className="icon-btn sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        </header>
        {copied && <div className="toast">Link copied — it unfurls with {symbol}'s next report.</div>}
        {error && <Notice tone="error">{error} <button className="link" onClick={retry}>Try again</button></Notice>}

        {loading && !data ? (
          <div className="sheet-body">{[90, 140, 200, 160].map((h, i) => <Skeleton key={i} h={h} />)}</div>
        ) : data && (
          <div className="sheet-body">
            <LensNote />
            {data.warnings.length > 0 && <Notice tone="warn">Partial picture: {data.warnings.join(" ")}</Notice>}

            {just && <JustReported j={just} today={today} />}

            {data.next && (
              <section className="next-card">
                <div className="nc-phase"><Phase h={shownSession(data.next)} size={44} projected={proj} /></div>
                <div>
                  <span className="eyebrow">{due ? "This report" : "Next report"} · Q{data.next.quarter} {data.next.year}</span>
                  <h3>{data.next.closed || data.next.overdue ? "Date not confirmed" : proj ? `Around ${fmtLong(data.next.date)}` : fmtLong(data.next.date)}</h3>
                  {data.next.closed && <span className="muted nc-closed">The data feed projects {fmtLong(data.next.date)}, but markets are closed that day ({data.next.closed}).</span>}
                  {data.next.overdue && <span className="muted nc-closed">{data.next.date ? `The data feed expected it on ${fmtLong(data.next.date)}, and there are no results yet.` : "The data feed has no date for this quarter yet, and there are no results yet."} The new date isn't confirmed.</span>}
                  {due && <span className="muted nc-closed">Results were expected {shownSession(data.next) ? `${PHASE_LABEL[shownSession(data.next)].toLowerCase()} ` : ""}{data.next.date === today ? "today" : `on ${fmtLong(data.next.date)}`}. None are in our data yet.</span>}
                  {!data.next.overdue && !due && <span className="muted" data-testid="nc-session">{contested ? <Term k="xcheck">Time unconfirmed</Term> : <Term k={data.next.session || "bmo"}>{PHASE_LABEL[data.next.session]}</Term>}{proj && data.next.session && !contested ? " (projected)" : ""}{nextIn != null && nextIn >= 0 && ` · ${nextIn === 0 ? "today" : nextIn === 1 ? "tomorrow" : `in ${nextIn} days`}`}</span>}
                  {data.next.nasdaq && !data.next.overdue && !due && <span className="muted nc-xcheck small" data-testid="nc-xcheck"><Term k="xcheck">Two calendars disagree.</Term> {contested
                    ? `Our data feed lists it ${SESSION_WORDS[data.next.session]}; Nasdaq's calendar, ${SESSION_WORDS[data.next.nasdaq.session]}.${data.moveSession?.session === "bmo" || data.moveSession?.session === "amc" ? ` Past moves point to ${SESSION_WORDS[data.moveSession.session]}.` : ""}`
                    : data.next.nasdaq.date === data.next.date
                    ? `Nasdaq's calendar lists it ${data.next.nasdaq.session ? PHASE_LABEL[data.next.nasdaq.session].toLowerCase() : "at another time"} that day.`
                    : `Nasdaq's calendar lists it on ${fmtLong(data.next.nasdaq.date)}${data.next.nasdaq.session ? `, ${PHASE_LABEL[data.next.nasdaq.session].toLowerCase()}` : ""}.`} Treat the {data.next.nasdaq.date === data.next.date ? "time" : "date"} as unconfirmed until the company announces it.</span>}
                  {proj && !data.next.overdue && !due && <span className="muted nc-projected small" data-testid="nc-projected"><Term k="unconfirmed">Date not yet confirmed by the company.</Term> The {data.next.session ? "date and time shown are" : "date shown is"} our data feed's projection and can move when the company announces its own.</span>}
                  {data.next.confirmed && <span className="nc-confirmed small"><Term k="companydate">Confirmed by the company</Term> · <a href={data.next.confirmed} target="_blank" rel="noopener noreferrer">source</a></span>}
                </div>
                <dl className="nc-stats">
                  <div><dt><Term k="consensus">EPS est</Term></dt><dd>{data.next.epsBasis ? "—" : epsIn(data.next.epsE, estCur)}</dd></div>
                  <div><dt><Term k="revenue">Revenue est</Term></dt><dd>{moneyIn(data.next.revE, estCur)}</dd></div>
                  <div><dt><Term k="expectedmove">Typical move</Term></dt><dd>{data.expectedMove != null ? `±${data.expectedMove.toFixed(1)}%` : "—"}</dd></div>
                </dl>
                {data.moveSession && data.history.length > 0 && <p className="nc-cur muted small" data-testid="nc-movesession">{data.moveSession.session
                  ? `Because the two calendars disagree on the time, the typical move is measured on the day this stock has usually moved after a report: ${data.moveSession.session === "bmo" ? "the report day itself (as for a report before the open)" : "the day after (as for a report after the close)"}.`
                  : "Because the two calendars disagree on the time, and the stock's past moves don't settle it, we can't tell which day the market reacted, so past moves show “—”."}</p>}
                {data.next.epsBasis && <p className="nc-cur muted small" data-testid="nc-ffo">This <Term k="reit">REIT</Term>'s recent results came in on a different measure from the feed's estimate (usually funds from operations, FFO, against net income a share), so we don't show the estimate as the bar.</p>}
                {!isUsd(estCur) && <p className="nc-cur muted small">Estimates are in <Term k="reportingcurrency">{currencyName(estCur)}</Term>, not US dollars, and so are the quarterly figures from its filings. The reaction table below is in US dollars.</p>}
              </section>
            )}

            {!just && !due && <AiPreviewMount data={data} />}

            {data.read.length > 0 && (
              <section className="read">
                <h4 className="eyebrow">The read</h4>
                <ul>{data.read.filter((r) => showTrader || !/\bRSI\b/.test(r)).map((r) => <li key={r}>{r}</li>)}</ul>
              </section>
            )}

            {data.chart && (
              <section className="card">
                <h4 className="eyebrow">The past year, report by report</h4>
                <PriceChart data={data} />
              </section>
            )}

            {isDated(data.next) && <Peers symbol={symbol} date={data.next.date} />}

            {everyday && !direct && via.length === 0 && (
              <section className="owned owned-none">
                <h4 className="eyebrow">Does this affect me?</h4>
                <p>Not that we can see. If you own index funds, it might — <button className="link" onClick={() => { onClose(); navigate("/compass"); }}>add what you own in My Money</button> and we'll check every fund for you.</p>
              </section>
            )}

            {(direct || via.length > 0) && (
              <section className="owned">
                <h4 className="eyebrow">{everyday ? "Does this affect me? Yes —" : <Term k="lookthrough">You already own this</Term>}</h4>
                <p>
                  {direct && <>Directly: <b>{money(direct.v)}</b>. </>}
                  {via.length > 0 && <>Through your funds: {via.map((v, i) => <span key={v.etf}>{i ? ", " : ""}<b>{v.etf}</b> ({v.weight.toFixed(1)}% ≈ {money(v.dollars)})</span>)}.</>}
                  {" "}About <b>{money((direct?.v ?? 0) + via.reduce((a, v) => a + v.dollars, 0))}</b> of your money rides on this report.
                </p>
                <span className="muted small">Fund holdings as of {ETF_ASOF} (top 10 per fund).</span>
              </section>
            )}

            <div className={`grade-pair ${showTrader ? "" : "single"}`}>
              {showTrader && <section className="grade-card">
                <header>
                  <div><h4 className="eyebrow"><Term k="setup">Setup into the print</Term></h4><span className="muted small">{data.setup.trend}</span></div>
                  <GradeBadge g={data.setup.grade} size="lg" />
                </header>
                {data.setup.factors.length ? <FactorList factors={data.setup.factors} /> : <p className="muted">Not enough price history.</p>}
              </section>}
              <section className="grade-card">
                <header>
                  <div><h4 className="eyebrow"><Term k="compass">Compass quality</Term></h4><span className="muted small">As a long-term holding</span></div>
                  <GradeBadge g={data.compass.grade} size="lg" />
                </header>
                {data.compass.factors.length ? <FactorList factors={data.compass.factors} /> : <p className="muted">Fundamentals unavailable for this company.</p>}
              </section>
            </div>

            {everyday && (
              <button className="link-quiet trader-toggle" onClick={() => setTraderDetails((x) => !x)} aria-expanded={traderDetails}>
                {traderDetails ? "Hide trader details" : "Show trader details (setup grade, RSI, volatility)"}
              </button>
            )}

            {data.history.length > 0 && (
              <section className="card">
                <h4 className="eyebrow">How it's reacted · {data.beatRate ? `${data.beatRate.beats}/${data.beatRate.total} beats` : "recent reports"}</h4>
                <Reactions history={data.history} expected={data.expectedMove} usd={isUsd(estCur)} />
              </section>
            )}

            <QuarterTrend quarters={data.quarters ?? []} history={data.history} cur={estCur} />

            {data.street && (
              <section className="card">
                <h4 className="eyebrow"><Term k="street">Street view</Term></h4>
                <Street s={data.street} />
              </section>
            )}

            {w && (
              <section className="card watch-edit">
                <h4 className="eyebrow">Your watchlist notes</h4>
                <label>Buy below <input inputMode="decimal" placeholder="$" defaultValue={w.buy ?? ""} onBlur={(e) => actions.updateWatch(symbol, { buy: parseFloat(e.target.value) || undefined })} /></label>
                {w.buy && data.quote && <span className={data.quote.price <= w.buy ? "pos" : "muted"}>{data.quote.price <= w.buy ? "At or below your buy price." : `${(((data.quote.price - w.buy) / w.buy) * 100).toFixed(1)}% above your buy price.`}</span>}
                <textarea placeholder="Why you're watching…" defaultValue={w.note ?? ""} onBlur={(e) => actions.updateWatch(symbol, { note: e.target.value })} />
              </section>
            )}

            <section className="sheet-cta" aria-label="Next steps">
              <div>
                <b>{w ? `${symbol} is on your watchlist.` : `Keep ${symbol} in your orbit.`}</b>
                <span className="muted small">{w ? "Its report shows up on your watchlist and in the My watchlist filter." : "Star it to track the report, the setup and your buy price."}</span>
              </div>
              <div className="cta-row">
                {w
                  ? <button className="cta cta-secondary" onClick={() => actions.toggleWatch(symbol)} aria-pressed={true}><Icon name="star" size={14} /> On your watchlist</button>
                  : <button className="cta cta-primary" onClick={() => actions.toggleWatch(symbol)} aria-pressed={false}><Icon name="star" size={14} /> Add to watchlist</button>}
                <button className={`cta ${w ? "cta-primary" : "cta-secondary"}`} onClick={doShare}><Icon name="share" size={14} /> Share this read</button>
              </div>
            </section>

            <footer className="sheet-foot muted small">
              Grades are rules-based and explained, never a recommendation. Data: Finnhub, Nasdaq, Yahoo Finance.
              {data.profile?.web && <> · <a href={data.profile.web} target="_blank" rel="noreferrer">{new URL(data.profile.web).hostname.replace("www.", "")}</a></>}
            </footer>
          </div>
        )}
      </aside>
    </div>
  );
}
