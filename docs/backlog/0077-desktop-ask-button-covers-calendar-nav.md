---
id: 0077
title: On desktop, the floating "Ask about this week" button covers the calendar's Next, week and month buttons
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-15
pr:
by: critic
---

## Why
Critic check 2026-11-15 07:00 UTC, build `17920611`, 1440×900, first visit to `/`. The fixed AI button (`src/components/ai/mount.tsx`, label "Ask about this week") sits at x 1182–1418, y 837–878. The calendar toolbar sits under it at y 829–871: **Next** (x 1250), **day view** (1291), **week view** (1332) and **month view** (1373). Playwright's `click({trial: true})` on Next, week view and month view fails with "`<div>` intercepts pointer events" without any scrolling. The glancer's first move after landing ("show me next week" or "switch to week") is blocked by a pill they didn't ask for, and the month label "NOVEMBER 2026" is half hidden under it (screenshot `shots/d_10_fab.png`, `shots/d_02_home.png`). Scrolling down frees the toolbar, so this is P1, not a broken flow.

## What
- Keep the floating button off interactive controls. Either reserve space for it (bottom padding or a right gutter where it docks), or hide it while the calendar toolbar is in the bottom 80 px of the viewport, or dock it into the toolbar row on wide screens.
- Check the other routes that mount it (`ROUTE_TASK` in `mount.tsx`) at 1440×900 and 1280×720.

## Acceptance criteria
- [ ] e2e at 1440×900 and 1280×720 on `/`: `click({trial: true})` succeeds on Previous, Next, day view, week view and month view right after load, with no scrolling
- [ ] e2e: for every route that mounts the AI button, the button's box doesn't intersect any visible `button`, `a` or `input` at first paint (1440×900, 390×844)
- [ ] The button stays reachable at 390×844 above the tab bar (no regression on phone)

## Test plan
A Playwright test on the recorded fixtures that loads `/` at the two desktop sizes and trial-clicks the toolbar buttons, plus a generic overlap check of the AI button against interactive elements per route.

## Out of scope
What the button does, and its label.
