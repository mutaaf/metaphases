// "What to watch" — an on-demand AI preview inside the ticker sheet. Never auto-spends:
// it writes only when asked, then remembers the result for that symbol for the day.
import { useEffect, useRef, useState } from "react";
import type { TickerResponse } from "../../../shared/types";
import { brainLabel, cachedPreview, openAiSettings, openAsk, savePreview, streamAi, useAiSettings } from "../../lib/ai";
import { tickerContext } from "../../lib/aiContext";
import { todayISO } from "../../lib/dates";
import { Markdown } from "./Markdown";
import { MoonLoader, AiSpark } from "./mount";

export default function AiPreview({ data }: { data: TickerResponse }) {
  const s = useAiSettings();
  const id = `${data.symbol}:${todayISO()}`;
  const [text, setText] = useState<string>(() => cachedPreview(id) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function write() {
    setBusy(true); setError(null); setText("");
    abort.current = new AbortController();
    let out = "";
    let failed = false;
    try {
      for await (const ev of streamAi({ task: "ticker", context: tickerContext(data), signal: abort.current.signal })) {
        if ("t" in ev) { out += ev.t; setText(out); }
        else if ("error" in ev) { failed = true; setError(ev.error); break; }
      }
      if (out && !failed) savePreview(id, out);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-preview" aria-live="polite">
      <header>
        <h4 className="eyebrow"><AiSpark size={11} /> What to watch in this report</h4>
        {text && !busy && <button className="link-quiet" onClick={write}>Rewrite</button>}
      </header>
      {!text && !busy && !error && (
        <div className="aip-cta">
          <p>A plain-English preview of {data.profile?.name ?? data.symbol}'s report, written from the numbers on this page — expectations, track record, setup and what could move it.</p>
          <button className="btn btn-box on" onClick={write}><AiSpark /> Write the preview</button>
        </div>
      )}
      {busy && !text && <p className="ask-wait"><MoonLoader /> Reading {data.symbol}'s numbers…</p>}
      {text && <Markdown text={text} />}
      {error && (
        <p className="aip-error">{error} {/key|limit|resting/i.test(error) && <button className="link" onClick={openAiSettings}>AI settings</button>}</p>
      )}
      <footer>
        <button className="link-quiet" onClick={openAiSettings}>{brainLabel(s)}</button>
        <button className="link-quiet" onClick={() => openAsk("ticker")}>Ask a follow-up →</button>
      </footer>
    </section>
  );
}
