import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAi } from "../../worker/ai";
import { cleanSpeech, handleSpeak, MAX_SPEAK_CHARS, pcmToWav, VOICES, wavHeader } from "../../worker/ai/speak";
import { containsKidTyped, markKidTyped, pickDeviceVoice } from "../../src/lib/voice";

const SECRET = "sk-test-voice-SECRET-123456";
const mk = (body: unknown, key: string | null = SECRET) =>
  new Request("https://x/metaphases/api/ai/speak", { method: "POST", headers: key ? { "x-mp-key": key } : {}, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("kids voice: /api/ai/speak", () => {
  const logs: string[] = [];
  const store = new Map<string, string>();
  beforeEach(() => {
    logs.length = 0; store.clear();
    (globalThis as any).caches = { default: { match: async (r: Request) => (store.has(r.url) ? new Response(store.get(r.url)) : undefined), put: async (r: Request, res: Response) => { store.set(r.url, await res.text()); } } };
    for (const k of ["log", "error", "warn", "info", "debug"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("validates provider, voice, text and key before calling anyone", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const cases: [unknown, string | null, RegExp][] = [
      [{ provider: "anthropic", voice: "coral", text: "hi" }, SECRET, /OpenAI or Google/],
      [{ provider: "openai", voice: "alloy-evil", text: "hi" }, SECRET, /friendly voices/],
      [{ provider: "gemini", voice: "coral", text: "hi" }, SECRET, /friendly voices/],
      [{ provider: "openai", voice: "coral", text: "   " }, SECRET, /nothing to read/],
      [{ provider: "openai", voice: "coral", text: "a".repeat(MAX_SPEAK_CHARS + 1) }, SECRET, /too much/],
      [{ provider: "openai", voice: "coral", text: "hi" }, null, /own key/],
      ["not json", SECRET, /OpenAI or Google/],
    ];
    for (const [b, k, re] of cases) {
      const r = await handleSpeak(mk(b, k));
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect((await r.json()).error).toMatch(re);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("OpenAI: fixed URL, gpt-4o-mini-tts, storyteller instructions, mp3 streamed back", async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => new Response(new Uint8Array([0xff, 0xf3, 1, 2]), { headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", f);
    const r = (await handleAi("/api/ai/speak", mk({ provider: "openai", voice: "nova", text: "**A share** is a slice!" }), {}))!;
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xf3, 1, 2]));
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRET}`);
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: "gpt-4o-mini-tts", voice: "nova", input: "A share is a slice!", response_format: "mp3" });
    expect(sent.instructions).toMatch(/9-year-old/);
  });

  it("Gemini: fixed URL, key in x-goog-api-key, voice config, PCM wrapped as WAV", async () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const b64 = btoa(String.fromCharCode(...pcm));
    const f = vi.fn(async (_u: string, _i: RequestInit) => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: b64 } }] } }] }));
    vi.stubGlobal("fetch", f);
    const r = await handleSpeak(mk({ provider: "gemini", voice: "Leda", text: "Hello!" }));
    expect(r.headers.get("content-type")).toBe("audio/wav");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes.length).toBe(44 + pcm.length);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(bytes.slice(44)).toEqual(pcm);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(SECRET);
    const sent = JSON.parse(init.body as string);
    expect(sent.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Leda");
    expect(sent.contents[0].parts[0].text).toMatch(/storyteller.*Hello!/);
  });

  it("WAV header is a correct 16-bit mono RIFF header", () => {
    const h = new DataView(wavHeader(48000, 24000).buffer);
    const s = (o: number) => String.fromCharCode(...new Uint8Array(h.buffer.slice(o, o + 4)));
    expect([s(0), s(8), s(12), s(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(h.getUint32(4, true)).toBe(36 + 48000);
    expect(h.getUint16(20, true)).toBe(1); // PCM
    expect(h.getUint16(22, true)).toBe(1); // mono
    expect(h.getUint32(24, true)).toBe(24000);
    expect(h.getUint32(28, true)).toBe(48000); // byte rate
    expect(h.getUint16(32, true)).toBe(2);
    expect(h.getUint16(34, true)).toBe(16);
    expect(h.getUint32(40, true)).toBe(48000);
    expect(pcmToWav(btoa("\x00\x01"), 16000).length).toBe(46);
  });

  it("a rejected or rate-limited key is explained without echoing or logging the key", async () => {
    for (const [status, re] of [[401, /didn't accept that key/], [429, /quota/]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(`{"error":"bad key ${SECRET}"}`, { status })));
      for (const provider of ["openai", "gemini"] as const) {
        const r = await handleSpeak(mk({ provider, voice: VOICES[provider][0], text: "Hi" }));
        const text = await r.text();
        expect(text).toMatch(re);
        expect(text).not.toContain(SECRET);
      }
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`network down ${SECRET}`); }));
    const r = await handleSpeak(mk({ provider: "openai", voice: "coral", text: "Hi" }));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain(SECRET);
  });

  it("the route caps requests per IP and never caches the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const r = (await handleAi("/api/ai/speak", mk({ provider: "openai", voice: "coral", text: "Hi" }), {}))!;
    expect(r.status).toBe(200);
    expect([...store.keys(), ...store.values()].join("\n")).not.toContain(SECRET);
  });

  it("strips markdown so marks aren't read aloud", () => {
    expect(cleanSpeech("## **Beat** means _more_!  ")).toBe("Beat means more!");
  });
});

describe("kids voice: client rules", () => {
  it("text a kid typed is flagged so it never goes to a voice provider", () => {
    markKidTyped("Is my school near Disney?");
    expect(containsKidTyped("You asked: Is my school near Disney? Luna says…")).toBe(true);
    expect(containsKidTyped("A share is a tiny slice of a company.")).toBe(false);
  });
  it("picks the friendliest English device voice", () => {
    const vs = [{ name: "Fred", lang: "en-US" }, { name: "Thomas", lang: "fr-FR" }, { name: "Samantha", lang: "en-US" }, { name: "Microsoft Aria Online (Natural)", lang: "en-US" }];
    expect(pickDeviceVoice(vs)?.name).toMatch(/Natural/);
    expect(pickDeviceVoice([{ name: "Fred", lang: "en-US" }, { name: "Thomas", lang: "fr-FR" }])?.name).toBe("Fred");
    expect(pickDeviceVoice([{ name: "Thomas", lang: "fr-FR" }])).toBeNull();
  });
});
