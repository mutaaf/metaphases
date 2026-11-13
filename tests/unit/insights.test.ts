// Box Office analytics: grown-up pages only, never the kids area (shared/insights.ts, worker withInsights).
import { describe, expect, it, vi } from "vitest";
import { INSIGHTS_TAG, isKidsPath } from "../../shared/insights";
import { withInsights } from "../../worker/index";

describe("Box Office tag", () => {
  it("knows the kids area", () => {
    for (const p of ["/kids", "/kids/", "/kids/school/3", "/kids/privacy"]) expect(isKidsPath(p)).toBe(true);
    for (const p of ["/", "/today", "/check", "/t/NVDA", "/kidsx", "/guide/"]) expect(isKidsPath(p)).toBe(false);
  });
  it("is appended last in <body> on grown-up pages and never on kids pages", async () => {
    const appended: string[] = [];
    vi.stubGlobal("HTMLRewriter", class {
      on(_sel: string, h: { element(el: unknown): void }) { h.element({ append: (html: string) => appended.push(html) }); return this; }
      transform(r: Response) { return r; }
    });
    const html = () => new Response("<body></body>", { headers: { "Content-Type": "text/html" } });
    withInsights(html(), "/");
    withInsights(html(), "/t/NVDA");
    expect(appended).toEqual([INSIGHTS_TAG, INSIGHTS_TAG]);
    withInsights(html(), "/kids");
    withInsights(html(), "/kids/school");
    withInsights(new Response("{}", { headers: { "Content-Type": "application/json" } }), "/");
    expect(appended).toHaveLength(2);
    vi.unstubAllGlobals();
  });
  it("is same-origin, so the CSP stays 'self'", () => {
    expect(INSIGHTS_TAG).toBe('<script async src="/boxoffice/v1/insights.js"></script>');
  });
});
