import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index";
import { MOON_CLUB_APP, isAppleAppLink } from "../../shared/kidsApp";

// /app/ (public/app/index.html): Moon Club's static parallax page, served ahead of the SPA shell.
const PAGE = readFileSync(new URL("../../public/app/index.html", import.meta.url), "utf8");
const seen: string[] = [];
const env = {
  FINNHUB_API_KEY: "k", FRED_API_KEY: "k",
  ASSETS: { fetch: async (req: Request) => { seen.push(new URL(req.url).pathname); return new Response(new URL(req.url).pathname === "/metaphases/app/" ? PAGE : "<div id=root></div>", { headers: { "Content-Type": "text/html" } }); } },
} as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const get = (p: string) => worker.fetch(new Request(`https://mutaafaziz.com/metaphases${p}`), env, ctx);
const STORE = "https://apps.apple.com/us/app/moon-club/id6829860949";

describe("/app/", () => {
  it("serves the static page with the CSP and no analytics tag", async () => {
    const r = await get("/app/");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Security-Policy")).toMatch(/script-src 'self'/);
    const body = await r.text();
    expect(body).toContain('id="h1"');
    expect(body).not.toContain("insights.js");
    expect(seen.at(-1)).toBe("/metaphases/app/");
  });
  it("redirects /app to /app/", async () => {
    const r = await get("/app");
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe("https://mutaafaziz.com/metaphases/app/");
  });
  it("leads with the App Store: the top bar and the hero link to the live listing before anything else", () => {
    expect(MOON_CLUB_APP.appStore).toBe(STORE);
    expect(isAppleAppLink(MOON_CLUB_APP.appStore)).toBe(true);
    const links = [...PAGE.matchAll(/<a [^>]*href="(https:[^"]+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const l of links) expect(l).toBe(STORE);
    expect(PAGE.indexOf('data-cta="top"')).toBeLessThan(PAGE.indexOf("<main>"));
    expect(PAGE.indexOf('data-cta="hero"')).toBeLessThan(PAGE.indexOf('id="duo"'));
  });
  it("obeys the CSP (no inline script), and its copy is general-audience and never advice", () => {
    expect(PAGE).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    expect(PAGE).toContain('<script src="motion.js"></script>');
    const title = PAGE.match(/<title>([^<]+)<\/title>/)![1];
    expect(title.length).toBeLessThanOrEqual(65);
    const desc = PAGE.match(/<meta name="description" content="([^"]+)"/)![1];
    expect(desc.length).toBeGreaterThanOrEqual(70);
    expect(desc.length).toBeLessThanOrEqual(160);
    const text = PAGE.slice(PAGE.indexOf("<body>")).replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\bkids?\b|\bchild(ren)?\b/i); // App Store 2.3.8: Moon Club is general-audience
    expect(text).not.toMatch(/\b(buy|sell) (it|now|this)\b|price target/i);
    expect(text).toMatch(/not financial advice/i);
    expect(PAGE).not.toMatch(/—|&mdash;/);
  });
  it("reads without motion: every Duo pose is a card with a real screen", () => {
    for (const s of ["s1", "s2", "s3", "s4"]) expect(PAGE).toContain(`class="step ${s} t-duo"`);
    for (const img of ["duo-closed.jpg", "duo-atlas.jpg", "duo-lesson.jpg"]) expect(PAGE).toContain(`class="still" src="${img}"`);
  });
});
