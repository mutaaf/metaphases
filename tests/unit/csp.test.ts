// 0036: every HTML page carries a CSP that blocks Cloudflare's edge-injected Web Analytics beacon.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker from "../../worker/index";
import { CSP, CSP_DIRECTIVES, THEME_SCRIPT_HASH, secureHtml } from "../../shared/csp";

const HTML = "<!doctype html><html><head><title>x</title></head><body></body></html>";
const env = {
  FINNHUB_API_KEY: "k", FRED_API_KEY: "k",
  ASSETS: { fetch: async (r: Request) => new URL(r.url).pathname.endsWith(".png")
    ? new Response("png", { headers: { "Content-Type": "image/png" } })
    : new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
} as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const get = (p: string) => worker.fetch(new Request(`https://mutaafaziz.com/metaphases${p}`, { headers: { Accept: "text/html" } }), env, ctx);

describe("CSP (0036)", () => {
  it("scripts and connections are limited to our own origin, so the beacon can't load or report", () => {
    expect(CSP).not.toMatch(/cloudflareinsights/);
    expect(CSP_DIRECTIVES["script-src"]).toEqual(["'self'", `'${THEME_SCRIPT_HASH}'`]);
    expect(CSP_DIRECTIVES["connect-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
    expect(CSP).toMatch(/object-src 'none'/);
    // Only the allowed client hosts from AGENTS.md § Invariants appear anywhere in the policy.
    const hosts = new Set(CSP.match(/https:\/\/[a-z0-9.-]+/g));
    expect([...hosts].sort()).toEqual(["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://static2.finnhub.io", "https://static9.finnhub.io"]);
  });

  it("the hash matches the inline theme script in index.html, and it is the only inline script", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toHaveLength(1);
    expect(`sha256-${createHash("sha256").update(inline[0]).digest("base64")}`).toBe(THEME_SCRIPT_HASH);
  });

  it("secureHtml adds the header to HTML only", () => {
    expect(secureHtml(new Response("x", { headers: { "Content-Type": "text/html" } })).headers.get("Content-Security-Policy")).toBe(CSP);
    expect(secureHtml(new Response("{}", { headers: { "Content-Type": "application/json" } })).headers.get("Content-Security-Policy")).toBeNull();
    expect(secureHtml(new Response("x", { headers: { "Content-Type": "image/png" } })).headers.get("Content-Security-Policy")).toBeNull();
  });

  it("the worker serves pages with the CSP, and assets and API errors without it", async () => {
    const pageRes = await get("/somewhere-without-share-meta");
    expect(pageRes.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(pageRes.headers.get("Content-Security-Policy")).toBe(CSP);
    expect(await pageRes.text()).toBe(HTML);
    expect((await get("/og.png")).headers.get("Content-Security-Policy")).toBeNull();
    expect((await get("/api/nope")).headers.get("Content-Security-Policy")).toBeNull();
  });
});
