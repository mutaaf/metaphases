// 0036: Cloudflare injects a Web Analytics beacon into our HTML at the edge. The CSP (shared/csp.ts, served
// by vite preview exactly as the worker serves it) must block it, without blocking anything of our own.
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const BEACON = "https://static.cloudflareinsights.com/beacon.min.js/v8c78df7c7c0f484497ecbca7046644da1771523124516";

/** Records CSP violations, and every response from Cloudflare's analytics hosts (Chromium still reports a
 *  CSP-blocked attempt as a request, then fails it, so a blocked beacon never gets a response). */
async function watch(page: Page) {
  const beaconHits: string[] = [];
  page.on("response", (r) => { if (/cloudflareinsights\.com/.test(r.url())) beaconHits.push(r.url()); });
  // If the browser ever let it through, the fake beacon would mark the page.
  await page.route(/cloudflareinsights\.com/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.__beacon = 1;" }));
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as any).__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return beaconHits;
}

/** What Cloudflare's auto-install appends to <body>. */
const inject = (page: Page) => page.evaluate((src) => new Promise<void>((done) => {
  const s = document.createElement("script");
  s.defer = true; s.src = src; s.setAttribute("data-cf-beacon", '{"token":"x","spa":2}');
  s.onerror = () => done(); s.onload = () => done();
  document.body.appendChild(s);
  setTimeout(done, 1500);
}), BEACON);

test.describe("no analytics beacon (0036)", () => {
  test("the page carries a CSP whose script-src and connect-src are our own origin", async ({ page }) => {
    const res = await page.goto("./");
    const csp = (await res!.allHeaders())["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'(;|$)/);
    expect(csp).toMatch(/connect-src 'self'(;|$)/);
    expect(csp).not.toMatch(/cloudflareinsights/);
  });

  for (const [path, lens] of [["./", "everyday"], ["./kids", "kids"], ["./kids/start", "kids"]] as const) {
    test.describe(path, () => {
      test.use({ lens });
      test(`the injected beacon is blocked and the app itself breaks no rule`, async ({ page }) => {
        const hits = await watch(page);
        await page.goto(path);
        await expect(page.locator("#root")).not.toBeEmpty();
        await page.waitForLoadState("networkidle");
        // The app's own scripts, styles, fonts and images load under the policy.
        expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
        await inject(page);
        expect(await page.evaluate(() => (window as any).__beacon)).toBeUndefined();
        expect(hits).toEqual([]);
        expect(await page.evaluate(() => (window as any).__violations)).toEqual([expect.stringMatching(/^script-src(-elem)? https:\/\/static\.cloudflareinsights\.com/)]);
      });
    });
  }
});
