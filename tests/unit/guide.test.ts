import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index";

// The guide (public/guide/index.html) is a static page with its text in the HTML, served ahead of the SPA shell.
const GUIDE = readFileSync(new URL("../../public/guide/index.html", import.meta.url), "utf8");
const seen: string[] = [];
const env = {
  FINNHUB_API_KEY: "k", FRED_API_KEY: "k",
  ASSETS: { fetch: async (req: Request) => { seen.push(new URL(req.url).pathname); return new Response(new URL(req.url).pathname === "/metaphases/guide/" ? GUIDE : "<div id=root></div>", { headers: { "Content-Type": "text/html" } }); } },
} as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const get = (p: string) => worker.fetch(new Request(`https://mutaafaziz.com/metaphases${p}`), env, ctx);

describe("/guide/", () => {
  it("serves the static guide with the CSP, not the SPA shell", async () => {
    const r = await get("/guide/");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Security-Policy")).toMatch(/script-src 'self'/);
    const body = await r.text();
    expect(body).toContain("<h1>Metaphases Guide");
    expect(seen.at(-1)).toBe("/metaphases/guide/");
  });
  it("redirects /guide to /guide/", async () => {
    const r = await get("/guide");
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe("https://mutaafaziz.com/metaphases/guide/");
  });
  it("is a complete page: title, description, canonical, no scripts, no em dashes, never advice", () => {
    const title = GUIDE.match(/<title>([^<]+)<\/title>/)![1];
    expect(title.length).toBeLessThanOrEqual(65);
    const desc = GUIDE.match(/<meta name="description" content="([^"]+)"/)![1];
    expect(desc.length).toBeGreaterThanOrEqual(70);
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(GUIDE).toContain('<link rel="canonical" href="https://mutaafaziz.com/metaphases/guide/" />');
    expect(GUIDE).not.toMatch(/<script/i);
    expect(GUIDE).not.toMatch(/—|&mdash;/);
    expect(GUIDE).toMatch(/not financial advice/i);
    const words = GUIDE.slice(GUIDE.indexOf("<body>")).replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(900);
  });
});
