// AI providers for Metaphases. One shape for all: `streamChat()` is an async generator of text deltas.
//
// - edge:      Cloudflare Workers AI (open model on Cloudflare's network; free daily allowance) — the default
// - anthropic: Claude Messages API
// - openai, xai, gemini: their OpenAI-compatible chat-completions endpoints
//
// Bring-your-own keys arrive per request (header x-mp-key) and are used for that one call only:
// never stored, never cached, never logged, never echoed in an error. Base URLs are fixed here,
// so the Worker can't be pointed at anything else. Plain fetch, no SDKs: small Worker, no lock-in.

export type ProviderId = "edge" | "anthropic" | "openai" | "xai" | "gemini";
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

export const EDGE_MODELS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/meta/llama-3.1-8b-instruct-fp8"];

export const PROVIDERS: Record<ProviderId, { label: string; vendor: string; needsKey: boolean; base?: string; fallbackModel?: string }> = {
  edge: { label: "Free (Workers AI)", vendor: "Open model", needsKey: false },
  anthropic: { label: "Anthropic", vendor: "Claude", needsKey: true, base: "https://api.anthropic.com/v1", fallbackModel: "claude-haiku-5-5" },
  openai: { label: "OpenAI", vendor: "GPT", needsKey: true, base: "https://api.openai.com/v1", fallbackModel: "gpt-5-mini" },
  xai: { label: "xAI", vendor: "Grok", needsKey: true, base: "https://api.x.ai/v1" },
  gemini: { label: "Google", vendor: "Gemini", needsKey: true, base: "https://generativelanguage.googleapis.com/v1beta/openai", fallbackModel: "gemini-2.5-flash" },
};
export const isProvider = (p: unknown): p is ProviderId => typeof p === "string" && p in PROVIDERS;

// ── Picking a sensible, cheap, current chat model from a provider's live list (ported from COLD GAS) ──
const PREFER: Partial<Record<ProviderId, RegExp[]>> = {
  anthropic: [/^claude-haiku-\d/, /^claude-sonnet-\d/],
  openai: [/^gpt-\d+(\.\d+)?-mini$/, /^gpt-\d+(\.\d+)?-nano$/, /^gpt-\d+(\.\d+)?-mini/, /^gpt-\d/],
  xai: [/^grok-[\d.]+-fast(?!.*(image|vision))/, /fast/, /mini/, /^grok-[\d.]+$/, /^grok/],
  gemini: [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash/, /^gemini-[\d.]+-flash-lite/, /^gemini/],
};
const NOT_CHAT = /(embed|tts|audio|realtime|transcri|whisper|dall|image|vision-preview|moderation|search|sora|video|veo|imagen|aqa|davinci|babbage|instruct$|codex|computer|live|native-audio|robotics|learnlm)/i;
const version = (id: string) => (id.match(/\d+(\.\d+)?/g) || ["0"]).map(Number);
const newer = (a: string, b: string) => {
  const va = version(a), vb = version(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) { const d = (va[i] || 0) - (vb[i] || 0); if (d) return d > 0; }
  return a.length < b.length;
};
export function pickModel(provider: ProviderId, ids: string[]): string | null {
  const chat = ids.filter((id) => !NOT_CHAT.test(id));
  for (const re of PREFER[provider] || []) {
    const hits = chat.filter((id) => re.test(id) && !/preview|exp|latest|\d{4}-\d{2}-\d{2}|\d{8}/.test(id));
    const pool = hits.length ? hits : chat.filter((id) => re.test(id));
    if (pool.length) return pool.reduce((best, id) => (newer(id, best) ? id : best));
  }
  return chat[0] || null;
}

/** A provider HTTP error that carries only a status — never the key or the provider's raw body. */
export class ProviderError extends Error {
  constructor(public status: number, message = `provider ${status}`) { super(message); }
}

// ── Request shaping (pure; unit-tested) ─────────────────────────────────────────────────────
export function buildRequest(provider: Exclude<ProviderId, "edge">, key: string, model: string, messages: ChatMessage[], maxTokens: number): { url: string; init: RequestInit } {
  const p = PROVIDERS[provider];
  if (provider === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    return {
      url: `${p.base}/messages`,
      init: {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, stream: true, messages: messages.filter((m) => m.role !== "system") }),
      },
    };
  }
  const reasoning = (provider === "openai" && /^(gpt-5|o\d)/.test(model)) || (provider === "gemini" && /^gemini-(2\.5|[3-9])/.test(model));
  const body: Record<string, unknown> = { model, messages, stream: true };
  if (reasoning) body.reasoning_effort = "low";
  else body.max_tokens = maxTokens;
  return {
    url: `${p.base}/chat/completions`,
    init: { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) },
  };
}

export function modelsRequest(provider: Exclude<ProviderId, "edge">, key: string): { url: string; init: RequestInit } {
  const p = PROVIDERS[provider];
  if (provider === "anthropic") return { url: `${p.base}/models?limit=100`, init: { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } } };
  return { url: `${p.base}/models`, init: { headers: { authorization: `Bearer ${key}` } } };
}

export async function listModels(provider: Exclude<ProviderId, "edge">, key: string): Promise<string[]> {
  const { url, init } = modelsRequest(provider, key);
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new ProviderError(r.status);
  const j = (await r.json()) as { data?: { id: string }[]; models?: { name?: string; id?: string }[] };
  const rows = j.data ?? j.models ?? [];
  return rows.map((m: { id?: string; name?: string }) => String(m.id ?? m.name ?? "").replace(/^models\//, "")).filter(Boolean);
}

// ── SSE parsing (pure; unit-tested) ─────────────────────────────────────────────────────────
/** Pull text deltas out of one SSE `data:` payload from any supported provider. */
export function deltaFrom(data: string): string {
  if (!data || data === "[DONE]") return "";
  let j: any;
  try { j = JSON.parse(data); } catch { return ""; }
  if (j.type === "content_block_delta" && j.delta?.type === "text_delta") return j.delta.text ?? ""; // Anthropic
  const c = j.choices?.[0]?.delta?.content; // OpenAI-compatible
  if (typeof c === "string") return c;
  if (typeof j.response === "string") return j.response; // Workers AI legacy shape
  return "";
}

async function* sseText(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const t = deltaFrom(line.slice(5).trim());
      if (t) yield t;
    }
  }
}

interface AiBinding { run(model: string, input: unknown, opts?: unknown): Promise<unknown> }

function abortable(src: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream<Uint8Array> {
  const reader = src.getReader();
  const timedOut = () => Object.assign(new Error("timed out"), { name: "AbortError" });
  signal.addEventListener("abort", () => { reader.cancel().catch(() => {}); }, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      const { done, value } = await reader.read();
      if (signal.aborted) c.error(timedOut());
      else if (done) c.close();
      else c.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

export async function* streamChat(opts: { provider: ProviderId; key?: string; model: string; messages: ChatMessage[]; maxTokens?: number; ai?: AiBinding; signal?: AbortSignal }): AsyncGenerator<string> {
  const maxTokens = opts.maxTokens ?? 900;
  if (opts.provider === "edge") {
    if (!opts.ai) throw new ProviderError(503, "edge brain unavailable");
    const input: Record<string, unknown> = { messages: opts.messages, stream: true, max_tokens: maxTokens };
    if (/gemma-4|qwen3|glm/.test(opts.model)) input.chat_template_kwargs = { enable_thinking: false };
    // opts.ai is Prompter (github.com/mutaaf/prompter), the shared AI gateway. An AbortSignal can't cross a
    // service binding, so the timeout cancels the stream on this side instead.
    const res = (await opts.ai.run(opts.model, input)) as ReadableStream<Uint8Array>;
    yield* sseText(opts.signal ? abortable(res, opts.signal) : res);
    return;
  }
  const { url, init } = buildRequest(opts.provider, opts.key ?? "", opts.model, opts.messages, maxTokens);
  const r = await fetch(url, { ...init, signal: opts.signal ?? AbortSignal.timeout(45_000) });
  if (!r.ok || !r.body) throw new ProviderError(r.status);
  yield* sseText(r.body);
}

/** A short, key-free message for the reader when a provider call fails. */
export function describeError(provider: ProviderId, err: unknown): string {
  if (/^Prompter: .*used up/.test(String((err as { message?: string })?.message))) return "The free brain is resting until 00:00 UTC. Add your own key in AI settings to keep going.";
  const label = PROVIDERS[provider]?.label ?? provider;
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) return `${label} didn't accept that key. Check it in AI settings.`;
  if (status === 404) return `${label} doesn't offer that model to this key — pick another in AI settings.`;
  if (status === 429) return `${label} is rate-limiting this key right now. Try again in a minute.`;
  if (status === 402) return `${label} says the account is out of credit.`;
  if (status === 503 && provider === "edge") return "The free brain is resting. Add your own key in AI settings to keep going.";
  if ((err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError") return `${label} took too long to answer.`;
  return `${label} couldn't be reached. Try again in a moment.`;
}
