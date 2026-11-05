---
id: 0036
title: Cloudflare Web Analytics is injected into every Metaphases page, including /kids; block it
status: ready
priority: P0
size: S
lens: tech-health
created: 2026-11-02
pr:
by: critic
---

## Evidence 2026-11-05 07:00 UTC (critic)
Unchanged: `static.cloudflareinsights.com` loaded on every Playwright page load at 390×844 and 1440×900 (7 routes each), and `curl -A "Mozilla/5.0 Chrome/130" -H "Accept: text/html" https://mutaafaziz.com/metaphases/ | grep -c cloudflareinsights` = 1.

## Why
AGENTS.md § Invariants: "No analytics, trackers, ads, accounts or paid services", and the kids surfaces are child-directed with "no data… no analytics". On 2026-11-02 at about 19:00 UTC, every HTML page served to a browser carries
`<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/…" data-cf-beacon='{…"spa":2}'>`. Cloudflare injects it at the edge (zone-level Web Analytics auto-install for mutaafaziz.com), so it doesn't appear in the repo and plain `curl` without a browser `Accept: text/html` doesn't see it. Measured on `/`, `/kids`, `/kids/start`, `/t/AAPL` and `/check`: present on all 5. A 390×844 Playwright load of `/` fetches 31.9 KB from `static.cloudflareinsights.com`. `spa: 2` means it reports every client-side route change, including kids pages. `static.cloudflareinsights.com` isn't on the allowed-host list.

## What
- Worker: on every HTML response, set a `Content-Security-Policy` whose `script-src` allows only `'self'` (plus any inline-script hash the app needs) and whose `connect-src` lists only `'self'`, `static2.finnhub.io`/`static9.finnhub.io` for images (`img-src`), and the Google Fonts hosts in `style-src`/`font-src`. That blocks the injected beacon in the browser without a dashboard change. Check that HTMLRewriter share meta and the PWA share target still work.
- Operator (note in the PR, not code): turn off Web Analytics auto-injection for `mutaafaziz.com/metaphases*` in the Cloudflare dashboard (Web Analytics → site → "Manage site" → exclude path, or disable automatic setup). The CSP is the guarantee, and this removes the wasted bytes.
- Add `static.cloudflareinsights.com` as an explicit "must never load" host in the e2e network allowlist test, if there is one.

## Acceptance criteria
- [ ] A Playwright load of production `/`, `/kids` and `/kids/start` at 390×844 makes **0 requests** to `static.cloudflareinsights.com` or `cloudflareinsights.com/cdn-cgi/rum` (record the loop in the PR)
- [ ] An e2e test asserts the HTML response carries a CSP `script-src` without `cloudflareinsights`, and that the page has no console CSP errors for the app's own scripts, fonts or logos
- [ ] Share meta (`/t/AAPL` og:title) and the PWA share target still work
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Unit: the worker's header helper sets the CSP on HTML only (not JSON or images). e2e: a page load with a routed fake `static.cloudflareinsights.com` script gets blocked (listen for `securitypolicyviolation`).

## Out of scope
Changing any other zone setting on mutaafaziz.com outside `/metaphases*`.
