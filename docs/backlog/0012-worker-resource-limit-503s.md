---
id: 0012
title: Stop the Worker failing with Cloudflare 1102 (resource limit) on ticker, share and calendar requests
status: shipped
priority: P0
size: M
lens: tech-health
created: 2026-11-01
pr: 15
by: critic
---

## Why
On 2026-11-01 at about 06:55 UTC, production answered many requests with `503` and the 17-byte body `error code: 1102`. That's Cloudflare's "Worker exceeded resource limits" (CPU time or memory). Measured with `curl`:
- `/api/ticker/:sym`: 8 of 29 large caps failed on the first try (CVX, ABBV, TMO, MCD, MS, BA, DE, LMT). Retrying the same symbols still failed about half the time, so it isn't a cold-cache-only effect. `/api/ticker/NVDA` failed 6 of 6.
- `/t/AAPL`, the share target, failed 3 of 6, and `/t/AMZN` and `/t/KO` returned 503. A link shared in chat unfurls as nothing.
- `/api/calendar?from=2026-11-01&to=2026-11-30` failed 1 of 6, and `/api/macro` failed 1 of 6.
- `/api/health` returned `ok:true` 6 of 6, so the health check and the agents' preflight can't see the outage.

On a phone, the ticker sheet then shows only "We couldn't reach the market data service." There's no retry, and the next-report date isn't shown even though the calendar already has it (screenshot `p360-sheet-MELI.png`, see `docs/critique/2026-11-01-0700.md` #1). In peak earnings week this breaks the core surface for roughly a third of opens.

## What
- Find the hot path. Use Workers observability, or `wrangler tail --format json` and look at `outcome: exceededCpu` / `exceededMemory`, to see which route and step burns CPU. The suspects are in `ticker()` (`worker/index.ts:144`): parsing the 2-year Yahoo candle JSON (`candles(symbol, "2y")`), `JSON.parse` on edge-cache hits for every upstream, `setupGrade` / `rsi` / `sma` over 500 bars, and `shareMeta()` (`worker/index.ts:347`) calling the whole `ticker()` just to build og text. The bundled `universe.json` (145 KB) is parsed at isolate start.
- Cache the *finished* `TickerResponse` per symbol (short TTL, for example 300 s) so a hit costs one `cache.match`, not 8 lookups plus grading. Have `shareMeta` read that cached response, or a slim cached summary.
- Trim the candle payload before caching: keep only `t` and `c` (and whatever `shapeChart` needs), not Yahoo's full response.
- `/api/health` must actually exercise one `ticker()` call (cache-busted or sampled) and report `ok:false` if it fails, so preflight catches this class of outage.
- Client: when `/api/ticker` fails, the sheet still shows what the calendar row already knows (date, session, estimates) and offers a "Try again" button.

## Acceptance criteria
- [ ] A loop of 60 cache-busted `GET /api/ticker/:sym` over 30 large caps against production returns 0 responses with body `error code: 1102` (record the command and result in the PR)
- [ ] 20 consecutive `GET /t/NVDA` return 200 with `og:title` present
- [ ] `/api/health` fails (`ok:false`, 503) when the ticker path throws (unit test with a stubbed failure)
- [ ] When `/api/ticker` returns 503, the sheet shows the calendar row's date, session and EPS estimate plus a working "Try again" button (e2e with a routed 503)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Unit: health reports a failing ticker probe. Unit: cached TickerResponse round-trip. e2e: route `/api/ticker/*` to a 503 once, then succeed; the sheet shows the partial card, and "Try again" loads the full sheet.

## Out of scope
Moving to a paid Workers plan (that's an operator decision; write a `proposal/` if CPU can't be brought under the free limit).
