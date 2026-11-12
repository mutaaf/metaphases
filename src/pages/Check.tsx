// Hype Check — "saw it on socials? check it before you buy." Paste a ticker, a $cashtag, a company
// name or a whole caption (or share a post here from Instagram / TikTok / X once installed).
// Every card is built from real numbers; the AI take only writes when asked. Never advice.
import { useEffect, useRef, useState } from "react";
import type { TickerResponse } from "../../shared/types";
import { InstallCoach, LensSwitch } from "../components/Everyday";
import { PageHero } from "../components/Hero";
import { GradeBadge, Icon, Notice, Phase, Skeleton, Term, Tile } from "../components/bits";
import { Markdown } from "../components/ai/Markdown";
import { AiSpark, MoonLoader } from "../components/ai/mount";
import { brainLabel, openAiSettings, streamAi, useAiSettings } from "../lib/ai";
import { tickerContext } from "../lib/aiContext";
import { useTicker } from "../lib/api";
import { curOf, heldVia, nameOf, UNIVERSE } from "../lib/data";
import { fmtShort, todayISO } from "../lib/dates";
import { currencyName, epsIn, isUsd, money } from "../lib/format";
import { extractTickers, questionsFor, redFlags, type Flag } from "../lib/hype";
import { movePlain, whatTheyDo, whenPlain } from "../lib/plain";
import { BASE, param, setParam } from "../lib/router";
import { actions, useStore } from "../lib/store";
import { shareStory } from "./Today";

const EXAMPLES = ["$NVDA", "Palantir", "Everyone on TikTok is buying $TSLA and Robinhood 🚀"];

function AiTake({ data, flags, caption, owned }: { data: TickerResponse; flags: Flag[]; caption: string; owned: number }) {
  const s = useAiSettings();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function write() {
    setBusy(true); setError(null); setText("");
    abort.current = new AbortController();
    let out = "";
    try {
      const context = { ticker: tickerContext(data), flags: flags.map((f) => ({ label: f.label, why: f.why })), caption: caption.slice(0, 280), owned: owned > 0 ? money(owned) : undefined };
      for await (const ev of streamAi({ task: "hype", context, signal: abort.current.signal })) {
        if ("t" in ev) { out += ev.t; setText(out); } else if ("error" in ev) { setError(ev.error); break; }
      }
    } catch (e) { if ((e as Error).name !== "AbortError") setError("The connection dropped. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section className="hc-ai" aria-live="polite">
      <h4 className="eyebrow"><AiSpark size={11} /> A calm second opinion</h4>
      {!text && !busy && !error && <button className="cta cta-secondary" onClick={write}><AiSpark /> Get a plain-English take</button>}
      {busy && !text && <p className="ask-wait"><MoonLoader /> Reading the real numbers…</p>}
      {text && <Markdown text={text} />}
      {error && <p className="aip-error">{error} <button className="link" onClick={openAiSettings}>AI settings</button></p>}
      <button className="link-quiet" onClick={openAiSettings}>{brainLabel(s)}</button>
    </section>
  );
}

function HypeCard({ sym, caption }: { sym: string; caption: string }) {
  const { data, loading, error, status, retry } = useTicker(sym);
  const { holdings, watch } = useStore();
  const today = todayISO();
  const tracked = !!UNIVERSE[sym];
  const name = data?.profile?.name ?? nameOf(sym);
  const flags = redFlags(data, { tracked, today });
  const via = heldVia(sym, holdings);
  const direct = holdings.find((h) => h.s === sym);
  const owned = (direct?.v ?? 0) + via.reduce((a, v) => a + v.dollars, 0);
  const starred = watch.some((w) => w.s === sym);
  if (loading && !data) return <article className="hc-card"><Skeleton h={28} w="50%" /><Skeleton h={90} /><Skeleton h={140} /></article>;
  if (error && !data) {
    // Only a definitive not-found for a symbol we don't track may say anything about the ticker itself (0026).
    if (status === 404 && !tracked) return <article className="hc-card"><h3>{sym}</h3><Notice tone="warn">We couldn't find market data for “{sym}”. Double-check the ticker — or it may be too small for free data sources, which is itself worth noting.</Notice></article>;
    return (
      <article className="hc-card" aria-label={`Hype check: ${sym}`}>
        <h3>{name}</h3>
        <Notice tone="warn">Couldn't load {sym} right now — the data service is busy. That says nothing about the company; try again in a moment.</Notice>
        <div className="cta-row"><button className="cta cta-secondary" onClick={retry}>Try again</button></div>
      </article>
    );
  }
  if (!data) return null;
  const reds = flags.filter((f) => f.tone !== "info").length;
  return (
    <article className="hc-card" aria-label={`Hype check: ${name}`}>
      <header className="hc-head">
        <Tile s={sym} size={56} force="logo" />
        <div><h3>{name}</h3><span className="eyebrow">{sym}{data.quote ? ` · $${data.quote.price.toFixed(2)}` : ""}</span></div>
        <span className={`hc-verdict ${reds >= 2 ? "hot" : reds === 1 ? "warm" : "calm"}`}>{reds === 0 ? "No red flags" : `${reds} red flag${reds > 1 ? "s" : ""}`}</span>
      </header>
      <p className="hc-does"><b>What it is:</b> {whatTheyDo(name, data.profile?.industry ?? UNIVERSE[sym]?.ind)}</p>
      <dl className="hc-facts">
        <div><dt>Next report</dt><dd>{data.next?.status === "results-pending" ? "Results expected, none in yet" : data.next?.closed || data.next?.overdue ? "Not confirmed yet" : data.next ? data.next.projected && !data.next.nasdaq ? <><Phase h={data.next.session} size={14} projected /> Around {fmtShort(data.next.date)} <span className="muted small">(not confirmed by the company yet)</span></> : <><Phase h={data.next.session} size={14} /> {whenPlain(data.next.date, data.next.session, today)}</> : "Not announced yet"}</dd></div>
        <div><dt><Term k="compass">Quality grade</Term></dt><dd><GradeBadge g={data.compass.grade} /> <span className="muted small">long-term business quality</span></dd></div>
        <div><dt><Term k="expectedmove">Earnings-day swing</Term></dt><dd>{movePlain(data.expectedMove)}</dd></div>
        {data.next?.epsE != null && data.next.status !== "results-pending" && <div><dt><Term k="consensus">Wall Street expects</Term></dt><dd>{epsIn(data.next.epsE, data.next.currency ?? curOf(sym))} a share this quarter{!isUsd(data.next.currency ?? curOf(sym)) && <> <span className="muted small">(in <Term k="reportingcurrency">{currencyName(data.next.currency ?? curOf(sym))}</Term>, not dollars)</span></>}</dd></div>}
      </dl>
      {owned > 0 && (
        <p className="hc-owned">You already own about <b>{money(owned)}</b> of it{via.length ? <> through {via.map((v) => v.etf).join(", ")}</> : null}{direct ? " (directly)" : ""}. Buying more adds to a bet you've already made.</p>
      )}
      {flags.length > 0 ? (
        <ul className="hc-flags">
          {flags.map((f) => <li key={f.key} className={`flag-${f.tone}`}><b>{f.label}</b><span>{f.why}</span></li>)}
        </ul>
      ) : <p className="hc-clean">None of our checks fired: it's profitable, not unusually swingy, and not mid-run. That still isn't a reason to buy — only an absence of obvious warning signs.</p>}
      <section className="hc-q">
        <h4 className="eyebrow">Ask yourself before buying</h4>
        <ol>{questionsFor(flags, name.split(/[ ,]/)[0]).map((q) => <li key={q}>{q}</li>)}</ol>
      </section>
      <AiTake data={data} flags={flags} caption={caption} owned={owned} />
      <div className="cta-row">
        <button className={`cta ${starred ? "cta-secondary" : "cta-primary"}`} onClick={() => actions.toggleWatch(sym)} aria-pressed={starred}><Icon name="star" size={14} /> {starred ? "Watching" : "Watch it instead"}</button>
        <button className="cta cta-secondary" onClick={() => shareStory(`t/${sym}`, `${sym} hype check`, `${name}: ${reds} red flag${reds === 1 ? "" : "s"} on Metaphases' Hype Check.`)}><Icon name="share" size={14} /> Share</button>
        <button className="cta cta-secondary" onClick={() => setParam("t", sym)}>The full read →</button>
      </div>
    </article>
  );
}

export default function CheckPage() {
  const initial = [param("title"), param("text"), param("url")].filter(Boolean).join(" ").trim();
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial);
  useEffect(() => { document.title = "Hype Check: saw a stock on socials? · Metaphases"; }, []);
  const syms = extractTickers(query, UNIVERSE);
  const run = (q: string) => { setText(q); setQuery(q); };

  return (
    <div className="page check">
      <PageHero
        eyebrow="Hype Check"
        title={<>Saw it on <em>socials</em>?</>}
        dek={<>Paste the post, a ticker or a company name. We'll show what it actually is, when it reports, how wild it swings and the red flags — from real numbers, never hype. <b>Not advice.</b></>}
        aside={<LensSwitch />}
      />
      <form className="hc-form" onSubmit={(e) => { e.preventDefault(); setQuery(text); }}>
        <label htmlFor="hc-input" className="eyebrow">Paste a caption, $ticker or name</label>
        <textarea id="hc-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. “Everyone on TikTok is loading up on $PLTR 🚀”" />
        <div className="hc-row">
          <button className="cta cta-primary" type="submit">Check it</button>
          <span className="hc-examples">{EXAMPLES.map((x) => <button type="button" key={x} className="chip" onClick={() => run(x)}>{x.length > 24 ? "a TikTok caption" : x}</button>)}</span>
        </div>
      </form>
      {query && !syms.length && <Notice>We couldn't spot a stock in that. Try the ticker with a $ in front, like <b>$NVDA</b>, or the company's name.</Notice>}
      <div className="hc-list">{syms.map((s) => <HypeCard key={s} sym={s} caption={query} />)}</div>
      {query && syms.length > 0 && <p className="muted small hc-foot">A viral post isn't research — and the person posting may already own it. Grades are rules-based and explained, never advice. <a href={`${BASE}/learn`}>Learn the terms</a>.</p>}
      <InstallCoach />
    </div>
  );
}

