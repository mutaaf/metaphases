import { useEffect, useRef, useState } from "react";
import type { Factor, Reaction, TickerResponse } from "../../shared/types";
import { useTicker } from "../lib/api";
import { co, heldVia, nameOf, ETF_ASOF } from "../lib/data";
import { daysBetween, fmtLong, todayISO } from "../lib/dates";
import { eps, mcap, money, pct } from "../lib/format";
import { actions, useStore } from "../lib/store";
import { BASE } from "../lib/router";
import { AiPreviewMount } from "./ai/mount";
import { useDialog } from "../lib/dialog";
import { IcsButtons, Peers, PriceChart, QuarterTrend } from "./Depth";
import { whatTheyDo } from "../lib/plain";
import { isEveryday } from "./Everyday";
import { navigate } from "../lib/router";
import { Bar, GradeBadge, Icon, Notice, Phase, PHASE_LABEL, share, Skeleton, Spark, Term, Tile } from "./bits";

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

function Reactions({ history, expected }: { history: Reaction[]; expected: number | null }) {
  const rows = [...history].reverse();
  const max = Math.max(4, ...rows.map((r) => Math.abs(r.move ?? 0)));
  return (
    <div className="reactions">
      <div className="rx-chart" role="img" aria-label="Stock price reaction to recent reports">
        {expected != null && <><span className="rx-band" style={{ height: `${(expected / max) * 50}%`, bottom: "50%" }} /><span className="rx-band" style={{ height: `${(expected / max) * 50}%`, top: "50%" }} /></>}
        {rows.map((r) => {
          const beat = r.epsA != null && r.epsE != null ? r.epsA >= r.epsE : null;
          const h = r.move == null ? 0 : (Math.abs(r.move) / max) * 50;
          return (
            <div key={r.date} className="rx-col" title={`${r.period}: ${r.move == null ? "no price data" : pct(r.move)} · EPS ${eps(r.epsA)} vs ${eps(r.epsE)}`}>
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
              <td className={r.surprisePct == null ? "" : r.surprisePct >= 0 ? "pos" : "neg"}>{pct(r.surprisePct)}</td>
              <td className={r.move == null ? "" : r.move >= 0 ? "pos" : "neg"}>{pct(r.move)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const via = heldVia(symbol, holdings);
  const direct = holdings.find((h) => h.s === symbol);
  const today = todayISO();
  const sheetRef = useRef<HTMLElement>(null);
  useDialog(sheetRef, onClose, { initialFocus: "self" });

  useEffect(() => {
    const prev = document.title;
    document.title = `${symbol} earnings: the full read · Metaphases`;
    return () => { document.title = prev; };
  }, [symbol]);

  const up = (data?.quote?.changePct ?? 0) >= 0;
  const nextIn = data?.next ? daysBetween(today, data.next.date) : null;
  const shareText = data?.next
    ? `${name} reports ${nextIn === 0 ? "today" : nextIn === 1 ? "tomorrow" : `in ${nextIn} days`} — ${data.beatRate ? `beat ${data.beatRate.beats} of its last ${data.beatRate.total}` : "see the setup"}${data.expectedMove ? `, typical move ±${data.expectedMove.toFixed(1)}%` : ""}.`
    : `${name}: earnings track record, quality grade and setup.`;
  const doShare = () => share(`${symbol} on Metaphases`, shareText, `${location.origin}${BASE}/t/${symbol}`, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer sheet" ref={sheetRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${name} earnings`}>
        <header className="sheet-head">
          <Tile s={symbol} size={56} force="logo" />
          <div className="sheet-id">
            <span className="eyebrow">{symbol} · {data?.profile?.industry || c?.sec || "—"}{data?.profile?.marketCap ? ` · ${mcap(data.profile.marketCap)}` : ""}</span>
            <h2>{name}</h2>
            {everyday && <p className="sheet-does">{whatTheyDo(name, data?.profile?.industry ?? c?.ind)}</p>}
            {data?.quote ? (
              <span className="quote"><b>${data.quote.price.toFixed(2)}</b> <span className={up ? "pos" : "neg"}>{pct(data.quote.changePct, 2)}</span> <Spark data={data.spark} w={90} h={22} /></span>
            ) : loading ? <Skeleton w={160} h={18} /> : null}
          </div>
          <div className="sheet-actions">
            <button className={`btn btn-box ${w ? "on" : ""}`} onClick={() => actions.toggleWatch(symbol)} aria-pressed={!!w}><Icon name="star" size={14} /> {w ? "Watching" : "Watch"}</button>
            {data?.next && <IcsButtons symbols={[symbol]} compact />}
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
            {data.warnings.length > 0 && <Notice tone="warn">Partial picture: {data.warnings.join(" ")}</Notice>}

            {data.next && (
              <section className="next-card">
                <div className="nc-phase"><Phase h={data.next.session} size={44} /></div>
                <div>
                  <span className="eyebrow">Next report · Q{data.next.quarter} {data.next.year}</span>
                  <h3>{fmtLong(data.next.date)}</h3>
                  <span className="muted"><Term k={data.next.session || "bmo"}>{PHASE_LABEL[data.next.session]}</Term>{nextIn != null && nextIn >= 0 && ` · ${nextIn === 0 ? "today" : nextIn === 1 ? "tomorrow" : `in ${nextIn} days`}`}</span>
                </div>
                <dl className="nc-stats">
                  <div><dt><Term k="consensus">EPS est</Term></dt><dd>{eps(data.next.epsE)}</dd></div>
                  <div><dt><Term k="revenue">Revenue est</Term></dt><dd>{money(data.next.revE)}</dd></div>
                  <div><dt><Term k="expectedmove">Typical move</Term></dt><dd>{data.expectedMove != null ? `±${data.expectedMove.toFixed(1)}%` : "—"}</dd></div>
                </dl>
              </section>
            )}

            <AiPreviewMount data={data} />

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

            {data.next && <Peers symbol={symbol} date={data.next.date} />}

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
                <Reactions history={data.history} expected={data.expectedMove} />
              </section>
            )}

            <QuarterTrend quarters={data.quarters ?? []} history={data.history} />

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
