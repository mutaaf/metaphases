// Client side of Metaphases AI: the viewer's provider choice + key (localStorage only, behind try/catch),
// a streaming helper for /api/ai/stream, and the BYOK connection test. The key never leaves this
// browser except as the x-mp-key header on an AI request, which our edge forwards and forgets.
import { useSyncExternalStore } from "react";
import { BASE } from "./router";
import { parseSse, type StreamEvent } from "./sse";

export type AiProvider = "edge" | "anthropic" | "openai" | "gemini" | "xai";
export type AiTask = "ticker" | "week" | "exposure" | "retrace" | "ask" | "hype" | "kids";

export interface AiSettings { provider: AiProvider; key: string; model: string; models: string[]; verified: boolean }

export const PROVIDER_INFO: Record<AiProvider, { label: string; vendor: string; blurb: string; keyHint: string; keyUrl: string }> = {
  edge: { label: "Free", vendor: "Workers AI", blurb: "An open model on Cloudflare's network. No key, no cost — limited to 30 questions an hour.", keyHint: "", keyUrl: "" },
  anthropic: { label: "Anthropic", vendor: "Claude", blurb: "Claude writes the clearest, most careful explanations.", keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { label: "OpenAI", vendor: "GPT", blurb: "GPT models, fast and capable.", keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Google", vendor: "Gemini", blurb: "Gemini Flash is quick and has a generous free tier.", keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey" },
  xai: { label: "xAI", vendor: "Grok", blurb: "Grok's fast models.", keyHint: "xai-…", keyUrl: "https://console.x.ai" },
};

const KEY = "metaphases:ai:v1";
const DEFAULT: AiSettings = { provider: "edge", key: "", model: "", models: [], verified: false };
let settings: AiSettings = (() => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT, ...JSON.parse(raw) }; } catch {}
  return DEFAULT;
})();
const subs = new Set<() => void>();
export function setAiSettings(next: Partial<AiSettings>) {
  settings = { ...settings, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  subs.forEach((f) => f());
}
export const getAiSettings = () => settings;
export const useAiSettings = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => settings);
export const usingOwnKey = (s: AiSettings = settings) => s.provider !== "edge" && !!s.key;
export const brainLabel = (s: AiSettings = settings) => (usingOwnKey(s) ? `${PROVIDER_INFO[s.provider].vendor}${s.model ? ` · ${s.model}` : ""}` : "Free brain · Workers AI");

export function forgetKey() { setAiSettings({ ...DEFAULT }); }

/** BYOK connect test: lists the models this key can use and suggests a sensible default. */
export async function testKey(provider: AiProvider, key: string): Promise<{ models: string[]; suggested: string | null }> {
  const r = await fetch(`${BASE}/api/ai/models`, { method: "POST", headers: { "content-type": "application/json", "x-mp-key": key }, body: JSON.stringify({ provider }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Couldn't reach the provider.");
  return { models: j.models ?? [], suggested: j.suggested ?? null };
}

export interface StreamOpts { task: AiTask; context: unknown; question?: string; history?: { role: "user" | "assistant"; content: string }[]; signal?: AbortSignal }
export type { StreamEvent };

export async function* streamAi(o: StreamOpts): AsyncGenerator<StreamEvent> {
  const s = settings;
  // Kid surfaces never send a grown-up's key (the worker enforces this too).
  const own = o.task !== "kids" && usingOwnKey(s);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (own) headers["x-mp-key"] = s.key;
  const r = await fetch(`${BASE}/api/ai/stream`, {
    method: "POST", headers, signal: o.signal,
    body: JSON.stringify({ task: o.task, context: o.context, question: o.question, history: o.history, provider: own ? s.provider : "edge", model: own ? s.model : undefined }),
  });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    yield { error: j.error ?? "The AI service couldn't be reached. Try again in a moment." };
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const [events, rest] = parseSse(buf + dec.decode(value, { stream: true }));
    buf = rest;
    for (const e of events) yield e;
  }
}

// ── Tiny cache for generated previews (per symbol per day), so a reopen doesn't spend again ──
const PKEY = "metaphases:ai:previews";
export function cachedPreview(id: string): string | null {
  try { return (JSON.parse(localStorage.getItem(PKEY) ?? "{}") as Record<string, string>)[id] ?? null; } catch { return null; }
}
export function savePreview(id: string, text: string) {
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) ?? "{}") as Record<string, string>;
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    all[id] = text;
    localStorage.setItem(PKEY, JSON.stringify(all));
  } catch {}
}

// ── Which AI surface is open (shared by every mount point) ─────────────────────────────────
export interface AiUi { ask: { task: AiTask; prompt?: string } | null; settings: boolean }
let ui: AiUi = { ask: null, settings: false };
const uiSubs = new Set<() => void>();
const setUi = (u: Partial<AiUi>) => { ui = { ...ui, ...u }; uiSubs.forEach((f) => f()); };
export const useAiUi = () => useSyncExternalStore((f) => { uiSubs.add(f); return () => uiSubs.delete(f); }, () => ui);
export const openAsk = (task: AiTask, prompt?: string) => setUi({ ask: { task, prompt }, settings: false });
export const closeAsk = () => setUi({ ask: null });
export const openAiSettings = () => setUi({ settings: true });
export const closeAiSettings = () => setUi({ settings: false });
