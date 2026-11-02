// POST /api/ai/speak — friendlier read-aloud voices for Metaphases Kids, on a GROWN-UP's own key.
//   body {provider: "openai"|"gemini", voice, text}  + header x-mp-key  →  audio/mpeg (OpenAI) | audio/wav (Gemini)
//   errors → {error} JSON in plain words.
// Text-to-speech only: there is no free fallback here (the device's own voice is the free option, client side).
// Same BYOK rules as chat (providers.ts): the key is used for this one call and is never stored, cached,
// logged or echoed. Base URLs and voice lists are fixed here, so the Worker can't be pointed elsewhere.

export type VoiceProvider = "openai" | "gemini";
export const VOICES: Record<VoiceProvider, readonly string[]> = {
  openai: ["coral", "nova", "fable", "shimmer", "sage"],
  gemini: ["Leda", "Puck", "Aoede", "Zephyr", "Kore"],
};
export const MAX_SPEAK_CHARS = 600;
const OPENAI_URL = "https://api.openai.com/v1/audio/speech";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const STYLE = "Warm, gentle, cheerful storyteller reading to a 9-year-old. Clear and a little slow. Smile in your voice.";
const TIMEOUT_MS = 25_000;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const LABEL: Record<VoiceProvider, string> = { openai: "OpenAI", gemini: "Google" };

export function speakError(provider: VoiceProvider, status: number | undefined, timedOut = false): string {
  const l = LABEL[provider];
  if (timedOut) return `${l} took too long to make the voice. Try again.`;
  if (status === 401 || status === 403) return `${l} didn't accept that key. Check it in the Grown-up corner.`;
  if (status === 429) return `${l} says this key is out of quota or busy. Try again later, or switch back to the device voice.`;
  if (status === 402) return `${l} says the account is out of credit.`;
  if (status === 400 || status === 404) return `${l} couldn't make that voice with this key.`;
  return `${l} couldn't be reached. Try again in a moment.`;
}

/** Strip markdown-ish marks so they aren't read aloud. */
export const cleanSpeech = (t: string) => t.replace(/[*_#`>~]/g, "").replace(/\s+/g, " ").trim();

/** 44-byte RIFF/WAVE header for 16-bit little-endian mono PCM. */
export function wavHeader(dataBytes: number, rate = 24000, channels = 1): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + dataBytes, true); w(8, "WAVE");
  w(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, channels, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * channels * 2, true); h.setUint16(32, channels * 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, dataBytes, true);
  return new Uint8Array(h.buffer);
}

function b64ToBytes(b64: string): Uint8Array {
  const native = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  if (native) return native(b64);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PCM (base64) → a playable WAV. One decode + one copy: a few ms of CPU for a few seconds of audio. */
export function pcmToWav(b64: string, rate = 24000): Uint8Array {
  const pcm = b64ToBytes(b64);
  const out = new Uint8Array(44 + pcm.length);
  out.set(wavHeader(pcm.length, rate), 0);
  out.set(pcm, 44);
  return out;
}

export async function handleSpeak(req: Request): Promise<Response> {
  const raw = await req.text();
  if (raw.length > 4000) return json({ error: "That's too much to read at once." }, 400);
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(raw); } catch {}
  const provider = body?.provider;
  if (provider !== "openai" && provider !== "gemini") return json({ error: "Pick OpenAI or Google for the voice." }, 400);
  const voice = typeof body?.voice === "string" && VOICES[provider].includes(body.voice) ? body.voice : null;
  if (!voice) return json({ error: "Pick one of the friendly voices." }, 400);
  const text = typeof body?.text === "string" ? cleanSpeech(body.text) : "";
  if (!text) return json({ error: "There's nothing to read." }, 400);
  if (text.length > MAX_SPEAK_CHARS) return json({ error: "That's too much to read at once." }, 400);
  const key = req.headers.get("x-mp-key") ?? "";
  if (!key) return json({ error: "Add your own key in the Grown-up corner to use this voice. The device voice is free." }, 400);

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (provider === "openai") {
      const r = await fetch(OPENAI_URL, {
        method: "POST", signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, instructions: STYLE, response_format: "mp3" }),
      });
      if (!r.ok || !r.body) { await r.body?.cancel(); return json({ error: speakError(provider, r.status) }, r.status === 429 ? 429 : 400); }
      return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    }
    const r = await fetch(GEMINI_URL, {
      method: "POST", signal,
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say this like a warm, gentle, cheerful storyteller reading to a 9-year-old, clear and a little slow: ${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (!r.ok) { await r.body?.cancel(); return json({ error: speakError(provider, r.status) }, r.status === 429 ? 429 : 400); }
    const j = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] } | null;
    const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) return json({ error: speakError(provider, 400) }, 400);
    const rate = Number(part.mimeType?.match(/rate=(\d+)/)?.[1]) || 24000;
    return new Response(pcmToWav(part.data, rate), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) {
    const name = (e as Error)?.name;
    return json({ error: speakError(provider, undefined, name === "TimeoutError" || name === "AbortError") }, 502);
  }
}
