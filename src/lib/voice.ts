// Metaphases Kids read-aloud. Free by default (the device's own voice, the friendliest one we can find);
// a grown-up can switch, behind the parental gate, to a warmer OpenAI or Google voice on THEIR OWN key.
// Rules (AGENTS.md, kids invariants):
//  - the key lives only in this browser (localStorage, try/catch) and leaves it only as the x-mp-key
//    header on /api/ai/speak, which the edge forwards and forgets;
//  - only app copy and Luna's answers are ever sent to a voice provider — never anything a kid typed
//    (`markKidTyped` registers typed text; any request containing it falls back to the device voice);
//  - any failure falls back to the device voice, so the 🔊 button always does something.
import { useSyncExternalStore } from "react";
// Same as router.ts BASE, computed here so this module has no window-touching imports (unit-testable).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type VoiceMode = "device" | "openai" | "gemini";
export interface VoiceSettings { mode: VoiceMode; key: string; voice: string }

export const VOICE_CHOICES: Record<Exclude<VoiceMode, "device">, { label: string; keyHint: string; voices: { id: string; blurb: string }[] }> = {
  openai: {
    label: "OpenAI", keyHint: "sk-…",
    voices: [
      { id: "coral", blurb: "Bright and cheerful" },
      { id: "nova", blurb: "Warm and friendly" },
      { id: "fable", blurb: "A storyteller's voice" },
      { id: "shimmer", blurb: "Soft and gentle" },
      { id: "sage", blurb: "Calm and clear" },
    ],
  },
  gemini: {
    label: "Google Gemini", keyHint: "AIza…",
    voices: [
      { id: "Leda", blurb: "Young and bright" },
      { id: "Puck", blurb: "Bouncy and upbeat" },
      { id: "Aoede", blurb: "Breezy and easy" },
      { id: "Zephyr", blurb: "Light and sunny" },
      { id: "Kore", blurb: "Steady and clear" },
    ],
  },
};
export const SAMPLE_LINE = "Hi! I'm Luna, your money helper. Let's learn how the market works, one little step at a time!";

const KEY = "metaphases:kids:voice:v1";
const DEFAULT: VoiceSettings = { mode: "device", key: "", voice: "" };
let settings: VoiceSettings = (() => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT, ...JSON.parse(raw) }; } catch {}
  return DEFAULT;
})();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function setVoiceSettings(next: Partial<VoiceSettings>) {
  settings = { ...settings, ...next };
  if (settings.mode !== "device" && !VOICE_CHOICES[settings.mode].voices.some((v) => v.id === settings.voice)) settings.voice = VOICE_CHOICES[settings.mode].voices[0].id;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  cache.clear();
  emit();
}
export function forgetVoiceKey() { setVoiceSettings({ ...DEFAULT }); }
export const getVoiceSettings = () => settings;
export const useVoiceSettings = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => settings);
export const usingVoiceKey = (s: VoiceSettings = settings) => s.mode !== "device" && !!s.key;

// ── Never send what a kid typed ─────────────────────────────────────────────────────────────
const typed = new Set<string>();
/** Register text a kid typed (e.g. an Ask Luna question). It will never be sent to a voice provider. */
export function markKidTyped(text: string) { const t = text.trim().toLowerCase(); if (t.length >= 3) typed.add(t); }
export const containsKidTyped = (text: string) => { const t = text.toLowerCase(); for (const x of typed) if (t.includes(x)) return true; return false; };

// ── Playback ────────────────────────────────────────────────────────────────────────────────
export const canDeviceSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
export const canSpeak = () => canDeviceSpeak() || (usingVoiceKey() && typeof Audio !== "undefined");

const FRIENDLY = [/natural/i, /enhanced/i, /premium/i, /samantha/i, /google us english/i, /aria/i, /jenny/i, /ava/i, /allison/i];
/** The friendliest English voice this device has (neural/enhanced first, then en-US). */
export function pickDeviceVoice(voices: { name: string; lang: string; localService?: boolean }[]) {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang) || v.lang === "en");
  const us = en.filter((v) => /us/i.test(v.lang));
  for (const re of FRIENDLY) { const hit = us.find((v) => re.test(v.name)) ?? en.find((v) => re.test(v.name)); if (hit) return hit; }
  return us[0] ?? en[0] ?? null;
}

const clean = (t: string) => t.replace(/[*_#`>~]/g, "").replace(/\s+/g, " ").trim();
function speakDevice(text: string) {
  if (!canDeviceSpeak()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean(text));
    const v = pickDeviceVoice(window.speechSynthesis.getVoices());
    if (v) u.voice = v as SpeechSynthesisVoice;
    u.lang = v?.lang ?? "en-US";
    u.rate = 0.95; u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  } catch {}
}

const cache = new Map<string, string>(); // text|voice → blob URL (in memory only)
const CACHE_MAX = 30;
let current: HTMLAudioElement | null = null;
let ctrl: AbortController | null = null;

export function stopSpeaking() {
  ctrl?.abort(); ctrl = null;
  if (current) { try { current.pause(); } catch {} current = null; }
  try { if (canDeviceSpeak()) window.speechSynthesis.cancel(); } catch {}
}

/** Read text aloud. Resolves when playback has started (or the device voice took over). */
export async function speakText(text: string): Promise<"byok" | "device"> {
  stopSpeaking();
  const s = settings;
  const body = clean(text).slice(0, 600);
  if (!usingVoiceKey(s) || !body || containsKidTyped(body) || typeof Audio === "undefined") { speakDevice(body); return "device"; }
  const ck = `${s.mode}|${s.voice}|${body}`;
  try {
    let url = cache.get(ck);
    if (!url) {
      const c = new AbortController(); ctrl = c;
      const r = await fetch(`${BASE}/api/ai/speak`, { method: "POST", signal: c.signal, headers: { "content-type": "application/json", "x-mp-key": s.key }, body: JSON.stringify({ provider: s.mode, voice: s.voice, text: body }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "voice failed");
      url = URL.createObjectURL(await r.blob());
      cache.set(ck, url);
      while (cache.size > CACHE_MAX) { const [k, u] = cache.entries().next().value!; URL.revokeObjectURL(u); cache.delete(k); }
      if (ctrl !== c) return "byok"; // a newer request took over
      ctrl = null;
    }
    const a = new Audio(url);
    current = a;
    await a.play();
    return "byok";
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "byok";
    speakDevice(body);
    return "device";
  }
}

/** Grown-up corner: speak a sample with explicit settings and surface the provider's error message. */
export async function sampleVoice(): Promise<string | null> {
  stopSpeaking();
  const s = settings;
  if (!usingVoiceKey(s)) { speakDevice(SAMPLE_LINE); return null; }
  try {
    const r = await fetch(`${BASE}/api/ai/speak`, { method: "POST", headers: { "content-type": "application/json", "x-mp-key": s.key }, body: JSON.stringify({ provider: s.mode, voice: s.voice, text: SAMPLE_LINE }) });
    if (!r.ok) return (await r.json().catch(() => ({})))?.error ?? "That voice didn't work.";
    const a = new Audio(URL.createObjectURL(await r.blob()));
    current = a;
    await a.play().catch(() => {});
    return null;
  } catch { return "Couldn't reach the voice. Check your connection."; }
}
