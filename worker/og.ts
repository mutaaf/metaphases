// PNG rasterizer for the per-ticker share card. Loaded only on /og/t/:sym.png (dynamic import from
// index.ts). resvg-wasm renders the SVG from shared/depth.ts#cardSvg with the brand fonts, which are
// fetched once from Google Fonts (TTF) and kept in the edge cache.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
// Wrangler bundles .wasm imports as a WebAssembly.Module.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

let ready: Promise<void> | null = null;
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800;900&family=Martian+Mono:wght@400&family=Instrument+Serif:ital@1";

async function fonts(ctx: ExecutionContext): Promise<Uint8Array[]> {
  const cache = caches.default;
  const css = await (await fetch(FONT_CSS, { headers: { "User-Agent": "Mozilla/5.0" } })).text(); // a plain UA gets TTF URLs
  const urls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.ttf)\)/g)).map((m) => m[1]);
  return Promise.all(
    urls.map(async (u) => {
      const key = new Request(u);
      let res = await cache.match(key);
      if (!res) {
        res = await fetch(u);
        if (!res.ok) throw new Error(`font ${res.status}`);
        ctx.waitUntil(cache.put(key, new Response(res.clone().body, { headers: { "Cache-Control": "public, max-age=2592000" } })));
      }
      return new Uint8Array(await res.arrayBuffer());
    }),
  );
}

export async function renderPng(svg: string, ctx: ExecutionContext): Promise<Uint8Array> {
  ready ??= initWasm(resvgWasm as unknown as WebAssembly.Module).catch((e) => { ready = null; throw e; });
  const [, fontBuffers] = await Promise.all([ready, fonts(ctx)]);
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Schibsted Grotesk" },
    background: "#edeae2",
  });
  return r.render().asPng();
}
