import { describe, expect, it } from "vitest";
import { handleSupport, hashIp, messageId, SUPPORT_MAX_MESSAGE, SUPPORT_PER_HOUR, SUPPORT_TTL_S, validateSupport, type KvLike } from "../../worker/support";

function fakeKv() {
  const data = new Map<string, { value: string; opts?: { expirationTtl?: number; metadata?: unknown } }>();
  const kv: KvLike = {
    get: async (k) => data.get(k)?.value ?? null,
    put: async (k, value, opts) => { data.set(k, { value, opts }); },
  };
  return { kv, data };
}
const post = (body: unknown, ip = "203.0.113.7", method = "POST") =>
  new Request("https://x/metaphases/api/kids/support", { method, headers: { "cf-connecting-ip": ip, "content-type": "application/json" }, body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

describe("support: validateSupport", () => {
  it("accepts a question with optional email and device, trimmed", () => {
    const r = validateSupport({ message: "  How do I reset progress?\nThanks  ", email: " mom@example.com ", device: "iPhone 15, Moon Club 0.13" });
    expect(r).toEqual({ ok: true, value: { message: "How do I reset progress?\nThanks", email: "mom@example.com", device: "iPhone 15, Moon Club 0.13" } });
    expect(validateSupport({ message: "Where is the grown-up corner?" })).toEqual({ ok: true, value: { message: "Where is the grown-up corner?", email: null, device: null } });
  });
  it("rejects empty, too-long, wrong-typed and bad-email input", () => {
    const bad: unknown[] = [null, [], "hi", {}, { message: 5 }, { message: "   " }, { message: "hey" }, { message: "a".repeat(SUPPORT_MAX_MESSAGE + 1) },
      { message: "A real question", email: "not-an-email" }, { message: "A real question", email: 42 }, { message: "A real question", device: "x".repeat(121) }];
    for (const b of bad) expect(validateSupport(b).ok, JSON.stringify(b)?.slice(0, 60)).toBe(false);
    expect(validateSupport({ message: "a".repeat(SUPPORT_MAX_MESSAGE) }).ok).toBe(true);
  });
  it("flags the honeypot as spam", () => {
    expect(validateSupport({ message: "Buy cheap stuff now", website: "http://spam" })).toMatchObject({ ok: false, spam: true });
  });
  it("strips control characters", () => {
    const r = validateSupport({ message: "Hello\u0000 there\u0007 friend", device: "iPad\nPro" });
    expect(r).toMatchObject({ ok: true, value: { message: "Hello there friend", device: "iPad Pro" } });
  });
});

describe("support: ids and hashing", () => {
  it("sorts newer messages first", () => {
    const older = messageId(1_700_000_000_000, "aaaa");
    const newer = messageId(1_800_000_000_000, "aaaa");
    expect([older, newer].sort()[0]).toBe(newer);
  });
  it("hashes IPs one way, stably", async () => {
    const h = await hashIp("203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{24}$/);
    expect(h).toBe(await hashIp("203.0.113.7"));
    expect(h).not.toBe(await hashIp("203.0.113.8"));
    expect(h).not.toContain("203");
  });
});

describe("support: POST /api/kids/support", () => {
  it("stores a valid message for 180 days and never stores the raw IP", async () => {
    const { kv, data } = fakeKv();
    const r = await handleSupport(post({ message: "How do Family League codes work?", email: "dad@example.com" }), { SUPPORT: kv }, Date.UTC(2026, 10, 4, 12));
    expect(r.status).toBe(200);
    const { ok, id } = await r.json() as { ok: boolean; id: string };
    expect(ok).toBe(true);
    const saved = data.get(`msg:${id}`)!;
    expect(saved.opts?.expirationTtl).toBe(SUPPORT_TTL_S);
    expect(JSON.parse(saved.value)).toMatchObject({ v: 1, id, at: "2026-11-04T12:00:00.000Z", message: "How do Family League codes work?", email: "dad@example.com", device: null });
    for (const [k, v] of data) { expect(k).not.toContain("203.0.113.7"); expect(v.value).not.toContain("203.0.113.7"); }
    // Rate-limit counters expire within the hour/day.
    for (const [k, v] of data) if (k.startsWith("rl:")) expect(v.opts?.expirationTtl).toBeLessThanOrEqual(2 * 86400);
  });
  it("answers 400 with plain words for bad input, and stores nothing", async () => {
    const { kv, data } = fakeKv();
    for (const b of ["not json", { message: "" }, { message: "Real question", email: "nope" }]) {
      const r = await handleSupport(post(b), { SUPPORT: kv });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/\w/);
    }
    expect([...data.keys()].filter((k) => k.startsWith("msg:"))).toHaveLength(0);
  });
  it("pretends the honeypot worked but stores nothing", async () => {
    const { kv, data } = fakeKv();
    const r = await handleSupport(post({ message: "Totally a parent", website: "x" }), { SUPPORT: kv });
    expect(r.status).toBe(200);
    expect(data.size).toBe(0);
  });
  it(`rate-limits to ${SUPPORT_PER_HOUR} per IP per hour, other IPs unaffected`, async () => {
    const { kv, data } = fakeKv();
    const now = Date.UTC(2026, 10, 4, 12);
    for (let i = 0; i < SUPPORT_PER_HOUR; i++) expect((await handleSupport(post({ message: `Question number ${i}` }), { SUPPORT: kv }, now + i)).status).toBe(200);
    const r = await handleSupport(post({ message: "One more question" }), { SUPPORT: kv }, now + 99);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/later/);
    expect((await handleSupport(post({ message: "Different family here" }, "198.51.100.1"), { SUPPORT: kv }, now + 100)).status).toBe(200);
    // Next hour is fresh.
    expect((await handleSupport(post({ message: "Back an hour later" }), { SUPPORT: kv }, now + 3600_000)).status).toBe(200);
    expect([...data.keys()].filter((k) => k.startsWith("msg:"))).toHaveLength(SUPPORT_PER_HOUR + 2);
  });
  it("rejects GET, oversized bodies, and a missing binding gracefully", async () => {
    const { kv } = fakeKv();
    expect((await handleSupport(post(null, undefined, "GET"), { SUPPORT: kv })).status).toBe(405);
    expect((await handleSupport(post({ message: "x".repeat(20_000) }), { SUPPORT: kv })).status).toBe(413);
    const r = await handleSupport(post({ message: "Hello there" }), {});
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/try again/);
  });
});
