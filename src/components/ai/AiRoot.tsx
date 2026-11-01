// Lazily-loaded AI panels: the Ask sheet (streaming, grounded chat) and the AI settings sheet (BYOK).
import { useEffect, useMemo, useRef, useState } from "react";
import { useCalendar, useMacro, useTicker } from "../../lib/api";
import {
  brainLabel, closeAiSettings, closeAsk, forgetKey, openAiSettings, PROVIDER_INFO, setAiSettings, streamAi, testKey,
  useAiSettings, useAiUi, usingOwnKey, type AiProvider, type AiTask,
} from "../../lib/ai";
import { exposureContext, retraceContext, tickerContext, weekContext } from "../../lib/aiContext";
import { addDays, MONTHS, todayISO, weekOf } from "../../lib/dates";
import { navigate, param } from "../../lib/router";
import { useStore } from "../../lib/store";
import { Icon } from "../bits";
import { Markdown } from "./Markdown";
import { MoonLoader, AiSpark } from "./mount";

export default function AiRoot() {
  const ui = useAiUi();
  return (
    <>
      {ui.ask && <AskPanel key={`${ui.ask.task}:${ui.ask.prompt ?? ""}`} task={ui.ask.task} prompt={ui.ask.prompt} />}
      {ui.settings && <SettingsSheet />}
    </>
  );
}

// ── Ask ──────────────────────────────────────────────────────────────────────────────────────
const TITLES: Record<AiTask, string> = {
  week: "The weeks ahead", exposure: "Your exposure", retrace: "This month, retraced", ticker: "This report", ask: "Ask Metaphases", hype: "Hype check",
};
const OPENERS: Record<AiTask, string> = {
  week: "Brief me on the reports and macro events ahead.",
  exposure: "Explain how upcoming reports touch my portfolio.",
  retrace: "What happened in this month's reports?",
  ticker: "What should I watch in this report?",
  ask: "",
  hype: "",
};
const CHIPS: Record<AiTask, string[]> = {
  week: ["Which mega caps report after the close next week?", "What's the biggest macro risk this week?", "Which reports could move the whole market?", "Explain this week like I'm new to investing"],
  exposure: ["Where am I most exposed?", "Which week matters most for my money?", "Explain look-through using my funds"],
  retrace: ["Which sector surprised the most?", "Were the misses concentrated anywhere?", "How does this compare with a normal season?"],
  ticker: ["What would a beat mean for this stock?", "Explain the setup grade simply", "Why is valuation graded that way?", "How big is a typical move here?"],
  ask: ["What reports this week?", "What is EPS?"],
  hype: ["How do I research a stock I saw on TikTok?", "What makes a stock risky?", "What is a typical earnings move?"],
};

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

function useGrounding(task: AiTask) {
  const today = todayISO();
  const { holdings } = useStore();
  const sym = param("t");
  // Same request paths as the pages, so the in-memory API cache is shared.
  const wkFrom = weekOf(today)[0];
  const range = task === "exposure" ? [wkFrom, addDays(wkFrom, 7 * 9 - 3)] : task === "retrace" ? [`${today.slice(0, 8)}01`, today] : [wkFrom, addDays(wkFrom, 18)];
  const needCal = task !== "ticker";
  const cal = useCalendar(needCal ? range[0] : today, needCal ? range[1] : today);
  const macro = useMacro();
  const tick = useTicker(task === "ticker" && sym ? sym : null);

  return useMemo(() => {
    if (task === "ticker") {
      if (!sym) return { ready: true, empty: "Open a company first — tap any logo on the calendar.", context: null };
      return { ready: !!tick.data, error: tick.error, context: tick.data ? tickerContext(tick.data) : null, subject: sym };
    }
    if (!cal.data) return { ready: false, error: cal.error, context: null };
    if (task === "exposure") {
      if (!holdings.length) return { ready: true, empty: "Add what you own in Compass first — then I can explain which reports touch your money.", context: null };
      return { ready: true, context: exposureContext(cal.data.events, holdings, today) };
    }
    if (task === "retrace") {
      const m = new Date(today + "T12:00:00");
      return { ready: true, context: retraceContext(cal.data.events, `${MONTHS[m.getMonth()]} ${m.getFullYear()}`) };
    }
    return { ready: !macro.loading, context: weekContext(cal.data.events, macro.data, range[0], range[1], today) };
  }, [task, sym, tick.data, tick.error, cal.data, cal.error, macro.data, macro.loading, holdings]);
}

function AskPanel({ task, prompt }: { task: AiTask; prompt?: string }) {
  const s = useAiSettings();
  const g = useGrounding(task);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const sym = param("t");
  const title = task === "ticker" && sym ? `Ask about ${sym}` : TITLES[task];

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Ask Metaphases`;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeAsk();
    document.addEventListener("keydown", esc);
    return () => { document.title = prev; document.removeEventListener("keydown", esc); abort.current?.abort(); };
  }, [title]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs]);

  async function ask(question: string, shown?: string) {
    if (busy || !g.context) return;
    const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    const first = history.length === 0;
    setMsgs((m) => [...m, { role: "user", content: shown ?? question }, { role: "assistant", content: "" }]);
    setBusy(true);
    abort.current = new AbortController();
    // The opening brief uses the task's own brief; follow-ups answer the question against the same facts.
    const body = first && !question
      ? { task, context: g.context }
      : { task: "ask" as AiTask, context: task === "ask" ? g.context : { [task]: g.context }, question, history };
    try {
      for await (const ev of streamAi({ ...body, question: body.question ?? "", signal: abort.current.signal })) {
        if ("t" in ev) setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + ev.t }; return c; });
        else if ("error" in ev) setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: ev.error, error: true }; return c; });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: "The connection dropped. Try again.", error: true }; return c; });
    } finally {
      setBusy(false);
    }
  }

  // Opened from a button that already says what it does → run that brief straight away.
  useEffect(() => {
    if (started.current || !g.ready || !g.context) return;
    started.current = true;
    if (prompt) ask(prompt);
    else if (task !== "ask") ask("", OPENERS[task]);
  }, [g.ready, g.context]);

  const submit = () => { const q = input.trim(); if (!q) return; setInput(""); ask(q); };

  return (
    <div className="drawer-scrim ask-scrim" onClick={closeAsk}>
      <section className="ask-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ask-head">
          <div>
            <span className="eyebrow"><AiSpark size={11} /> Ask Metaphases</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={closeAsk} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="ask-body">
          {g.empty ? (
            <div className="ask-empty">
              <p>{g.empty}</p>
              {task === "exposure" && <button className="btn btn-box on" onClick={() => { closeAsk(); navigate("/compass"); }}>Open Compass</button>}
            </div>
          ) : !g.ready ? (
            <div className="ask-wait"><MoonLoader size={18} /> {g.error ? "Couldn't load the data to ground the answer. Try again in a moment." : "Gathering the facts…"}</div>
          ) : null}

          {msgs.map((m, i) => (
            <div key={i} className={`msg msg-${m.role} ${m.error ? "msg-error" : ""}`}>
              {m.role === "user" ? <p>{m.content}</p> : m.content ? <Markdown text={m.content} /> : <span className="ask-wait"><MoonLoader /> Reading the numbers…</span>}
            </div>
          ))}
          {msgs.some((m) => m.error && /key|limit|resting/i.test(m.content)) && (
            <button className="link small" onClick={openAiSettings}>Open AI settings</button>
          )}
          <div ref={end} />
        </div>

        {g.context && (
          <div className="ask-chips" aria-label="Suggested questions">
            {CHIPS[task].map((c) => <button key={c} className="chip" disabled={busy} onClick={() => ask(c)}>{c}</button>)}
          </div>
        )}
        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={g.context ? "Ask anything about these numbers…" : "Waiting for data…"} disabled={!g.context} aria-label="Your question" />
          {busy ? (
            <button type="button" className="btn btn-box" onClick={() => abort.current?.abort()}>Stop</button>
          ) : (
            <button type="submit" className="btn btn-box on" disabled={!input.trim() || !g.context}>Ask</button>
          )}
        </form>
        <footer className="ask-foot">
          <button className="link-quiet" onClick={openAiSettings} title="Change AI provider or add your own key"><AiSpark size={11} /> {brainLabel(s)}{!usingOwnKey(s) && " — use your own key"}</button>
          <span>Answers use only Metaphases' data · never advice</span>
        </footer>
      </section>
    </div>
  );
}

// ── Settings (BYOK) ──────────────────────────────────────────────────────────────────────────
function SettingsSheet() {
  const s = useAiSettings();
  const [provider, setProvider] = useState<AiProvider>(s.provider);
  const [key, setKey] = useState(s.provider === provider ? s.key : "");
  const [status, setStatus] = useState<{ tone: "ok" | "err" | "busy"; text: string } | null>(s.verified && s.provider !== "edge" ? { tone: "ok", text: `Connected — ${s.models.length} models available.` } : null);
  const [models, setModels] = useState<string[]>(s.provider === provider ? s.models : []);
  const [model, setModel] = useState(s.model);
  const info = PROVIDER_INFO[provider];

  useEffect(() => {
    const prev = document.title;
    document.title = "AI settings · Metaphases";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeAiSettings();
    document.addEventListener("keydown", esc);
    return () => { document.title = prev; document.removeEventListener("keydown", esc); };
  }, []);

  const pick = (p: AiProvider) => {
    setProvider(p);
    setStatus(null);
    if (p === s.provider) { setKey(s.key); setModels(s.models); setModel(s.model); } else { setKey(""); setModels([]); setModel(""); }
    if (p === "edge") { setAiSettings({ provider: "edge", key: "", model: "", models: [], verified: false }); setStatus({ tone: "ok", text: "Using the free brain. Nothing to set up." }); }
  };

  async function connect() {
    if (!key.trim()) return;
    setStatus({ tone: "busy", text: `Checking with ${info.label}…` });
    try {
      const r = await testKey(provider, key.trim());
      const chosen = r.suggested ?? r.models[0] ?? "";
      setModels(r.models); setModel(chosen);
      setAiSettings({ provider, key: key.trim(), model: chosen, models: r.models, verified: true });
      setStatus({ tone: "ok", text: `Connected — ${r.models.length} models available. Saved in this browser.` });
    } catch (e) {
      setStatus({ tone: "err", text: (e as Error).message });
    }
  }

  return (
    <div className="drawer-scrim" onClick={closeAiSettings}>
      <aside className="drawer ai-settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="AI settings">
        <header className="drawer-head">
          <div>
            <span className="eyebrow"><AiSpark size={11} /> AI settings</span>
            <h2>Choose your brain</h2>
          </div>
          <button className="icon-btn" onClick={closeAiSettings} aria-label="Close"><Icon name="close" /></button>
        </header>
        <p className="ai-intro">Metaphases can explain any report, your week, your portfolio's exposure and the month's results — using only its own numbers, never advice. It works free out of the box. Bring your own key for a stronger model and no hourly limit.</p>

        <div className="prov-grid" role="radiogroup" aria-label="AI provider">
          {(Object.keys(PROVIDER_INFO) as AiProvider[]).map((p) => (
            <button key={p} role="radio" aria-checked={provider === p} className={`prov ${provider === p ? "on" : ""}`} onClick={() => pick(p)}>
              <b>{PROVIDER_INFO[p].label}</b>
              <span className="eyebrow">{PROVIDER_INFO[p].vendor}</span>
              <span className="prov-blurb">{PROVIDER_INFO[p].blurb}</span>
            </button>
          ))}
        </div>

        {provider !== "edge" && (
          <section className="key-box">
            <label className="key-label" htmlFor="ai-key">Your {info.label} API key</label>
            <div className="key-row">
              <input id="ai-key" type="password" autoComplete="off" spellCheck={false} placeholder={info.keyHint} value={key} onChange={(e) => { setKey(e.target.value); setStatus(null); }} onKeyDown={(e) => e.key === "Enter" && connect()} />
              <button className="btn btn-box on" onClick={connect} disabled={!key.trim() || status?.tone === "busy"}>{status?.tone === "busy" ? "Testing…" : "Test & save"}</button>
            </div>
            <p className="muted small">No key yet? <a href={info.keyUrl} target="_blank" rel="noreferrer">Get one from {info.label}</a> — it takes a minute.</p>
            {models.length > 0 && (
              <label className="model-pick">
                <span className="eyebrow">Model</span>
                <select value={model} onChange={(e) => { setModel(e.target.value); setAiSettings({ model: e.target.value }); }}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <span className="muted small">We picked a fast, affordable one. Bigger models write more carefully but cost more per answer.</span>
              </label>
            )}
          </section>
        )}
        {status && <div className={`ai-status ai-status-${status.tone}`} role="status">{status.tone === "busy" && <MoonLoader />} {status.text}</div>}

        <section className="key-where">
          <h4 className="eyebrow">Where your key lives</h4>
          <ul>
            <li><b>Only in this browser</b> (local storage). Not in an account, not on our servers.</li>
            <li>Sent with each AI request through our edge to {provider === "edge" ? "the provider" : info.label}, used for that one call, then forgotten — <b>never stored or logged</b>.</li>
            <li>You pay {provider === "edge" ? "nothing" : `${info.label} directly, at their prices`}. Remove it any time.</li>
          </ul>
          {usingOwnKey(s) && <button className="btn btn-ghost" onClick={() => { forgetKey(); setKey(""); setModels([]); setProvider("edge"); setStatus({ tone: "ok", text: "Key removed. Back on the free brain." }); }}>Forget my key</button>}
        </section>
      </aside>
    </div>
  );
}
