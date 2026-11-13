---
id: 0071
title: The phone's first visit takes 5.8–7.9 s to finish loading (2.2 s on Nov 12); about 1.4 MB of it is full-size logo PNGs
status: ready
priority: P1
size: M
lens: performance
created: 2026-11-13
pr:
by: critic
---

## Why
Critic measurements, build `132f08ed`, 390×844 cold context, Playwright against production:
| Run | `load` | LCP | bytes |
|---|---|---|---|
| 2026-11-12 19:00 | 2.2 s | ~2.0 s | ~1.5 MB |
| 2026-11-13 07:00 | 4.19 s | 1.97 s | 1.50 MB |
| 2026-11-13 19:00 | 7.91 s, then 5.78 s | 2.16 s | 1.45 MB |

Every sheet route (`/t/DKS`, `/t/ANF`, `/t/MRVL`, `/t/CPRT`) took 6.5–7.5 s to `networkidle` on the phone, against 3.1–3.4 s this morning. The 07:00 critique said a second run above 3 s warranted a ticket.

The resource waterfall of the cold home load (`performance.getEntriesByType('resource')`, sorted by end time): about 30 logo images from `static2.finnhub.io` start at 2.33 s and end between 5.1 s and 5.66 s. Each one is a full-size PNG: DE.png is 84 KB, MDT.png 61 KB (`curl -w %{size_download}`), drawn at 40 px or less. The Box Office loader then fetches `posthog-recorder.js` (75 KB), `surveys.js` (51 KB) and `exception-autocapture.js` (7 KB) at 5.43 s. LCP is fine, so the page looks ready, but a phone on a weak connection pays for well over a megabyte of images that render as 40 px squares, and the `load` event (what the PWA and Lighthouse judge) waits for them.

## What
- Logos below the fold or in collapsed weeks: `loading="lazy"` and `decoding="async"` with explicit `width`/`height`, so they leave the critical path (check that the month cells already do this; the full-page screenshot shows blank tiles from Nov 9 on, which suggests lazy loading is partly there).
- Cap the number of logos fetched on first paint (e.g. this week and next only) and fall back to the existing monogram tile for the rest until scrolled into view.
- Box Office is operator-approved and its loader lives outside this repo. Don't change it; if the recorder/surveys bundles are worth deferring, write that up for the operator in a `proposal/` note instead.

## Acceptance criteria
- [ ] Cold phone (390×844) home visit on production: `load` ≤ 3.0 s and LCP ≤ 2.5 s, median of 3 runs, recorded in the PR
- [ ] No more than 12 logo requests before `load` on the home page at 390×844
- [ ] `/t/<sym>` reaches `networkidle` ≤ 4 s on the phone (median of 3)
- [ ] Logos still render at 390×844 and 1440×900 once scrolled into view; no layout shift from late logos (CLS ≤ 0.05)
- [ ] Main bundle stays ≤ 120 kB gzip

## Test plan
e2e: count `static2.finnhub.io` requests before `load` on the fixture home page at 390×844 and assert the cap. Production timings in the PR body.

## Out of scope
Changing the Box Office tag or its config (operator's). Self-hosting logos (a new host or storage needs a proposal).
