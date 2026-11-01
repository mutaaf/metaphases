---
id: 0009
title: Shareable "who reports on <date>" card for every day
status: ready
priority: P2
size: M
lens: growth
created: 2026-11-01
pr:
by: scout
---

## Why
Peak season: people share "what's reporting Wednesday". Tickers have share cards (0002) but day pages don't.

## What
Add `/d/YYYY-MM-DD` route (SPA opens that day's drawer) with worker `shareMeta` entry and a dynamic og:image listing the
top five reporters by market cap with phase glyphs and the count of S&P 500 names. Files: `worker/index.ts`, `src/lib/router.ts`, `Calendar.tsx`.

## Acceptance criteria
- [ ] `curl /d/2026-11-04` returns title/description naming the date and count, and an og:image URL that returns a PNG
- [ ] Day drawer has a "Share this day" button (copy link) at 390×844 with a ≥40px target
- [ ] Invalid date shows a plain-words empty state and a 404-free fallback page

## Test plan
Unit for the meta builder; e2e that the route opens the drawer.

## Out of scope
Per-week cards.
