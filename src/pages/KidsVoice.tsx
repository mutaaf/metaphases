// Grown-up corner (behind the parental gate): choose Luna's read-aloud voice. Free device voice by
// default; a grown-up can use their own OpenAI or Google key for a warmer storyteller voice.
// The key stays in this browser and is used only to turn app text and Luna's answers into speech.
import { useState } from "react";
import { getAiSettings } from "../lib/ai";
import {
  canDeviceSpeak, forgetVoiceKey, sampleVoice, setVoiceSettings, useVoiceSettings, usingVoiceKey, VOICE_CHOICES, type VoiceMode,
} from "../lib/voice";

const mask = (k: string) => (k.length > 8 ? `${k.slice(0, 3)}…${k.slice(-4)}` : "••••");

export function VoiceCorner() {
  const s = useVoiceSettings();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const site = getAiSettings();
  const siteKey = s.mode !== "device" && site.provider === s.mode && site.key && site.key !== s.key ? site.key : "";
  const choose = (mode: VoiceMode) => { setMsg(null); setDraft(""); setVoiceSettings({ mode, key: mode === s.mode ? s.key : "" }); };
  const hear = async () => {
    setBusy(true); setMsg(null);
    const err = await sampleVoice();
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: usingVoiceKey() ? "That's Luna's new voice! 🎉" : "That's the device voice." });
  };
  const choice = s.mode !== "device" ? VOICE_CHOICES[s.mode] : null;
  return (
    <section className="k-section k-voice" aria-labelledby="k-voice-t">
      <h2 id="k-voice-t">Luna's voice 🔊</h2>
      <p className="k-small">Every card has a "Read it to me" button. The device voice is free. For a warmer storyteller voice, use your own OpenAI or Google key.</p>
      <div className="k-voice-modes" role="radiogroup" aria-label="Read-aloud voice">
        {([["device", "Device voice", "Free · built into this phone or computer"], ["openai", "OpenAI", "Your key · very natural voices"], ["gemini", "Google Gemini", "Your key · has a free tier"]] as const).map(([m, label, sub]) => (
          <button key={m} role="radio" aria-checked={s.mode === m} className={`k-voice-mode${s.mode === m ? " on" : ""}`} onClick={() => choose(m)}>
            <b>{label}</b><small>{sub}</small>
          </button>
        ))}
      </div>
      {s.mode === "device" && !canDeviceSpeak() && <p className="k-small" role="note">This browser has no device voice. Choose OpenAI or Google to turn read-aloud on.</p>}
      {choice && (
        <>
          {s.key ? (
            <div className="k-voice-key">
              <span>🔑 Key saved on this device: <code>{mask(s.key)}</code></span>
              <button className="k-btn k-voice-forget" onClick={() => { forgetVoiceKey(); setMsg({ ok: true, text: "Key forgotten. Back to the device voice." }); }}>Forget key</button>
            </div>
          ) : (
            <form className="k-code" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setVoiceSettings({ key: draft.trim() }); setDraft(""); setMsg(null); } }}>
              <label htmlFor="k-voice-key"><b>Your {choice.label} key</b></label>
              <div className="k-ask-row">
                <input id="k-voice-key" type="password" autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={choice.keyHint} />
                <button className="k-btn k-btn-primary" disabled={!draft.trim()}>Save</button>
              </div>
              {siteKey && <button type="button" className="k-link" onClick={() => setVoiceSettings({ key: siteKey })}>Use the {choice.label} key saved in Metaphases settings</button>}
            </form>
          )}
          <div>
            <b>Pick a voice</b>
            <div className="k-voice-list" role="radiogroup" aria-label={`${choice.label} voice`}>
              {choice.voices.map((v) => (
                <button key={v.id} role="radio" aria-checked={s.voice === v.id} className={`k-voice-pick${s.voice === v.id ? " on" : ""}`} onClick={() => setVoiceSettings({ voice: v.id })}>
                  <b>{v.id}</b><small>{v.blurb}</small>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="k-voice-actions">
        <button className="k-btn" onClick={hear} disabled={busy || (s.mode !== "device" && !s.key)}>{busy ? "Making the voice…" : "Hear a sample 🎧"}</button>
        {msg && <span className={`k-small${msg.ok ? "" : " k-voice-err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
      </div>
      <ul className="k-list k-small">
        <li>Your key stays on this device. It's sent only to make the voice, and we never store it.</li>
        <li>Only the app's own words and Luna's answers are read by the voice service. Anything your kid types is never sent.</li>
        <li>Luna's answers still come from our free, kid-safe helper. Your key is used for the voice only.</li>
      </ul>
    </section>
  );
}
