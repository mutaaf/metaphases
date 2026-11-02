---
id: 0034
title: Kids calm polish + parent sharing — aurora field, hairline surfaces, kids share card, Luna favicon
status: shipped
priority: P1
size: S
lens: user-value
created: 2026-11-02
pr: 0
by: operator
---

## Why
The operator: "everything should be soo aesthetically polished and minimal like apple and tesla and favicon and share links etc so I can send to my parent friends". Kids links unfurled with the grown-up calendar card and the surfaces used ink outlines and offset shadows that read as toy-like.

## What
- Calm layer in `src/styles/kids.css`: hairline borders, diffused shadows, one label voice, glass top bar + tab bar, quiet "Grown-ups" pill, and one GPU-cheap aurora field (a single fixed blurred layer, transform-only animation, static under reduced motion, hidden in print).
- Parent sharing: `public/og-kids.png` ("Money, explained for kids."), per-route titles/descriptions for `/kids`, `/kids/start`, `/kids/school` (worker `PAGES`), Luna favicon + home-screen icon + "Moon Club" app title on kids pages (worker rewrite + in-app swap), and a "Share Moon Club" button in the Grown-up corner (share sheet or copy).
- Fixes: phone top bar no longer wraps; the grown-up corner no longer overflows 390px (family-league code row, since #27); scrolling to a control never parks it under the sticky bars.

## Acceptance criteria
- [x] Kids pages unfurl with the kids card and parent-ready copy
- [x] No horizontal overflow at 390px in the Grown-up corner (e2e guard)
- [x] All kids e2e green on phone + desktop

## Test plan
E2E: full suite; new overflow guard in `kids-followups.spec.ts`. Live check after deploy: `curl` the `/kids` HTML for og:image and the kids icon links.

## Out of scope
The native app (Moon Club, separate repo) and an app-download landing (follows once TestFlight is live).
