// Metaphases AI routes (mounted under /metaphases/api/ai/*):
//   POST /api/ai/stream  {task, context, question?, history?, provider?, model?}  (+ x-mp-key for BYOK)
//        → text/event-stream: data: {"t":"…"} … data: {"done":true,"provider","model"}  |  data: {"error":"…"}
//   POST /api/ai/models  {provider}  + x-mp-key → {provider, models, suggested}   (BYOK connect test)
//   GET  /api/ai/status  → {edge, models, freeLimitPerHour, providers}
// The free brain (Workers AI) is rate-limited per IP; BYOK calls are the user's own spend and aren't.
import { buildMessages, isTask } from "./prompts";
import { describeError, EDGE_MODELS, isProvider, listModels, pickModel, PROVIDERS, streamChat, type ProviderId } from "./providers";

export interface AiEnv { AI?: { run(model: string, input: unknown, opts?: unknown): Promise<unknown> } }

export const FREE_PER_HOUR = 30;
const FREE_PER_DAY_GLOBAL = 3000;
const MAX_BODY = 64_000;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Cheap counter on the edge Cache API (per colo, best-effort — good enough to stop runaway use). */
async function bump(key: string, ttl: number): Promise<number> {
  const req = new Request(`https://rate.metaphases.internal/${encodeURIComponent(key)}`);
  const hit = await caches.default.match(req);
  const n = (hit ? parseInt(await hit.text(), 10) || 0 : 0) + 1;
  await caches.default.put(req, new Response(String(n), { headers: { "Cache-Control": `public, max-age=${ttl}` } }));
  return n;
}
async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mp:${ip}`));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hourKey = () => new Date().toISOString().slice(0, 13);

async function readBody(req: Request): Promise<Record<string, any> | null> {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function handleAi(p: string, req: Request, env: AiEnv): Promise<Response | null> {
  if (p === "/api/ai/status") {
    return json({
      edge: !!env.AI, models: EDGE_MODELS, freeLimitPerHour: FREE_PER_HOUR,
      providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, vendor: v.vendor, needsKey: v.needsKey }])),
    });
  }

  if (p === "/api/ai/models" && req.method === "POST") {
    const body = await readBody(req);
    const provider = body?.provider;
    const key = req.headers.get("x-mp-key") ?? "";
    if (!isProvider(provider) || provider === "edge") return json({ error: "Pick a provider that uses your own key." }, 400);
    if (!key) return json({ error: "Paste your key first." }, 400);
    if ((await bump(`models:${await ipHash(req)}:${hourKey()}`, 3600)) > 30) return json({ error: "Too many connection tests — wait a few minutes." }, 429);
    try {
      const models = (await listModels(provider, key)).sort();
      return json({ provider, models, suggested: pickModel(provider, models) ?? PROVIDERS[provider].fallbackModel ?? null });
    } catch (e) {
      return json({ error: describeError(provider, e) }, 400);
    }
  }

  if (p === "/api/ai/stream" && req.method === "POST") {
    const body = await readBody(req);
    if (!body || !isTask(body.task)) return json({ error: "Unknown AI task." }, 400);
    const key = req.headers.get("x-mp-key") ?? "";
    const provider: ProviderId = isProvider(body.provider) && body.provider !== "edge" && key ? body.provider : "edge";
    let model = typeof body.model === "string" && body.model.length < 120 ? body.model : "";
    if (provider === "edge") {
      if (!env.AI) return json({ error: "The free brain isn't available here. Add your own key in AI settings." }, 503);
      const ip = await ipHash(req);
      if ((await bump(`edge:${ip}:${hourKey()}`, 3600)) > FREE_PER_HOUR) return json({ error: `You've used the free brain ${FREE_PER_HOUR} times this hour. Add your own key in AI settings for unlimited questions.` }, 429);
      if ((await bump(`edge-day:${new Date().toISOString().slice(0, 10)}`, 86400)) > FREE_PER_DAY_GLOBAL) return json({ error: "The free brain hit today's limit. Add your own key in AI settings to keep going." }, 429);
      model = EDGE_MODELS.includes(model) ? model : EDGE_MODELS[0];
    } else if (!model) {
      model = PROVIDERS[provider].fallbackModel ?? "";
      if (!model) return json({ error: "Choose a model in AI settings." }, 400);
    }
    const messages = buildMessages({ task: body.task, context: body.context, question: body.question, history: body.history });

    const enc = new TextEncoder();
    const send = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
    const models = provider === "edge" ? [model, ...EDGE_MODELS.filter((m) => m !== model)] : [model];
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        let any = false;
        for (let i = 0; i < models.length; i++) {
          try {
            for await (const t of streamChat({ provider, key, model: models[i], messages, ai: env.AI })) { any = true; ctrl.enqueue(send({ t })); }
            if (any) { ctrl.enqueue(send({ done: true, provider, model: models[i] })); break; }
          } catch (e) {
            // Never splice two models' output together: only fall back to the next free model if nothing streamed yet.
            if (any || i === models.length - 1) { ctrl.enqueue(send({ error: describeError(provider, e) })); any = true; break; }
          }
        }
        if (!any) ctrl.enqueue(send({ error: "The model returned an empty answer. Try rephrasing." }));
        ctrl.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  }
  return null;
}
