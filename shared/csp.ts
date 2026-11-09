// 0036: the Content-Security-Policy every Metaphases HTML page carries.
//
// Cloudflare's zone-level Web Analytics auto-install injects a beacon
// (`static.cloudflareinsights.com/beacon.min.js`, reporting to `cloudflareinsights.com/cdn-cgi/rum`) into
// HTML at the edge, after the Worker answers, so it never appears in the repo. AGENTS.md forbids analytics
// anywhere and kids pages promise "no data, no analytics". This policy is the guarantee: scripts may come
// only from our own origin (plus the one inline theme script, by hash), and the page may connect only to
// our own origin, so the injected beacon can neither load nor report. Hosts mirror AGENTS.md § Invariants;
// adding one needs an operator `proposal/`.
//
// The same string is served by `vite preview` (vite.config.ts), so the e2e suite runs the real app under it.

/** sha256 of the inline theme script in index.html. A unit test recomputes it, so a change to that script fails CI until this is updated. */
export const THEME_SCRIPT_HASH = "sha256-cQIaHJDEQ7hBlMsO3zZJDOCBe4lYhgpQwz1OhAmxUA8=";

export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", `'${THEME_SCRIPT_HASH}'`],
  // React `style={…}` props are style attributes, which need 'unsafe-inline'. Styles can't phone home: connect-src stays 'self'.
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
  // Company logos (universe `lg`), plus story-card / recap images made on the device (blob:, data:).
  "img-src": ["'self'", "data:", "blob:", "https://static2.finnhub.io", "https://static9.finnhub.io"],
  // Read-aloud audio from /api/ai/speak is played from a blob: URL (src/lib/voice.ts).
  "media-src": ["'self'", "blob:", "data:"],
  "connect-src": ["'self'"],
  "manifest-src": ["'self'"],
  "worker-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

export const CSP = Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");

/** Adds the CSP to an HTML response only (JSON, images and scripts pass through untouched). */
export function secureHtml(res: Response): Response {
  if (!(res.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html")) return res;
  const out = new Response(res.body, res);
  out.headers.set("Content-Security-Policy", CSP);
  return out;
}
