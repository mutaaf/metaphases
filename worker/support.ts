// POST /api/kids/support: the Moon Club "Contact us" form (grown-ups only; /kids/support).
// Stores each message in the SUPPORT KV namespace for 180 days so the operator can reply
// (`npm run support:inbox`). No third parties, no tracking. The sender's IP is never stored:
// rate limiting counts per salted SHA-256 hash, and those counters expire after an hour.

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
}
export interface SupportEnv { SUPPORT?: KvLike }

export const SUPPORT_MAX_MESSAGE = 2000;
export const SUPPORT_MAX_EMAIL = 254;
export const SUPPORT_MAX_DEVICE = 120;
export const SUPPORT_TTL_S = 180 * 24 * 3600;
export const SUPPORT_PER_HOUR = 5;
export const SUPPORT_PER_DAY_GLOBAL = 300;
const MAX_BODY = 16_000;

export interface SupportInput { message: string; email: string | null; device: string | null }
export interface SupportRecord extends SupportInput { id: string; at: string; v: 1 }

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
// Strip control characters (keep newlines and tabs in the message).
const clean = (s: string, keepLines: boolean) =>
  s.normalize("NFC").replace(keepLines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, keepLines ? "" : " ").trim();

/** Pure validation. Returns the cleaned input, or a plain-words error for the form. */
export function validateSupport(body: unknown): { ok: true; value: SupportInput } | { ok: false; error: string; spam?: true } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "We couldn't read that message. Please try again." };
  const b = body as Record<string, unknown>;
  // Honeypot: a hidden field people never see. Bots fill it in.
  if (typeof b.website === "string" && b.website.trim() !== "") return { ok: false, error: "spam", spam: true };
  if (typeof b.message !== "string") return { ok: false, error: "Please write your question." };
  const message = clean(b.message, true);
  if (message.length < 5) return { ok: false, error: "Please write your question (a few words is fine)." };
  if (message.length > SUPPORT_MAX_MESSAGE) return { ok: false, error: `Please keep it under ${SUPPORT_MAX_MESSAGE} characters.` };
  let email: string | null = null;
  if (b.email != null && b.email !== "") {
    if (typeof b.email !== "string") return { ok: false, error: "That email address doesn't look right." };
    const e = clean(b.email, false);
    if (e && (e.length > SUPPORT_MAX_EMAIL || !EMAIL.test(e))) return { ok: false, error: "That email address doesn't look right. You can also leave it empty." };
    email = e || null;
  }
  let device: string | null = null;
  if (b.device != null && b.device !== "") {
    if (typeof b.device !== "string") return { ok: false, error: "Please check the device field." };
    const d = clean(b.device, false);
    if (d.length > SUPPORT_MAX_DEVICE) return { ok: false, error: `Please keep the device and version under ${SUPPORT_MAX_DEVICE} characters.` };
    device = d || null;
  }
  return { ok: true, value: { message, email, device } };
}

/** Newest-first sortable id: KV lists keys in lexicographic order, so invert the timestamp. */
export function messageId(now: number, rand: string): string {
  return `${String(9_999_999_999_999 - now).padStart(13, "0")}-${rand}`;
}

export async function hashIp(ip: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mp-support:${ip}`));
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function bump(kv: KvLike, key: string, ttl: number): Promise<number> {
  const n = (parseInt((await kv.get(key)) ?? "0", 10) || 0) + 1;
  await kv.put(key, String(n), { expirationTtl: ttl });
  return n;
}

export async function handleSupport(req: Request, env: SupportEnv, now = Date.now()): Promise<Response> {
  if (req.method !== "POST") return reply({ error: "Use the form on the support page." }, 405);
  const kv = env.SUPPORT;
  if (!kv) return reply({ error: "The message box isn't working right now. Please try again later." }, 503);
  const text = await req.text();
  if (text.length > MAX_BODY) return reply({ error: `Please keep it under ${SUPPORT_MAX_MESSAGE} characters.` }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return reply({ error: "We couldn't read that message. Please try again." }, 400); }
  const v = validateSupport(body);
  // Pretend a bot's honeypot submission worked, so it learns nothing; store nothing.
  if (!v.ok) return v.spam ? reply({ ok: true }) : reply({ error: v.error }, 400);

  const hour = new Date(now).toISOString().slice(0, 13);
  const ipKey = `rl:${await hashIp(req.headers.get("cf-connecting-ip") ?? "local")}:${hour}`;
  if ((await bump(kv, ipKey, 3600)) > SUPPORT_PER_HOUR) return reply({ error: "That's a lot of messages in one hour. Please try again a little later." }, 429);
  if ((await bump(kv, `rl:all:${hour.slice(0, 10)}`, 2 * 86400)) > SUPPORT_PER_DAY_GLOBAL) return reply({ error: "Our message box is full for today. Please try again tomorrow." }, 429);

  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const id = messageId(now, rand);
  const record: SupportRecord = { v: 1, id, at: new Date(now).toISOString(), ...v.value };
  await kv.put(`msg:${id}`, JSON.stringify(record), { expirationTtl: SUPPORT_TTL_S, metadata: { at: record.at } });
  return reply({ ok: true, id });
}
