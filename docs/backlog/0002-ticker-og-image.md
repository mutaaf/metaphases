---
id: 0002
title: Dynamic share card per ticker (og:image for /t/SYM)
status: in-progress
priority: P1
size: L
lens: growth
created: 2026-10-31
pr:
by: operator
---

## Why
Shared links are the growth loop. `/t/NVDA` already gets a specific title and description, but every
link shows the same generic image. A card showing NVDA's logo, next date, phase glyph, typical move and
beat streak would make every share an ad for the product.

## What
`GET /og/t/:sym.png` in the worker renders a 1200×630 card in the brand style (paper, ink, ultramarine,
moon glyph). Use satori + resvg-wasm, or a hand-built SVG rasterized with resvg-wasm, loaded lazily only
on that route, with fonts fetched from Google Fonts and cached. Edge-cache for 6h. `page()` sets
`og:image` and `twitter:image` to it for ticker URLs.

## Acceptance criteria
- [ ] `/og/t/AAPL.png` returns a valid 1200×630 PNG under 300 kB, in under 1.5 s warm
- [ ] The card shows ticker, name, next report date and session, typical move and beat rate; falls back to the generic card on any error
- [ ] `/t/AAPL` HTML references it in og:image and twitter:image
- [ ] Worker bundle stays under the Workers free-plan size limit (3 MB compressed)

## Test plan
Unit test for the SVG template (pure function → contains expected text). A worker smoke test via
`wrangler dev` if feasible, otherwise a documented manual check plus screenshots in the PR.

## Out of scope
Cards for day links (do this after the ticker card).
