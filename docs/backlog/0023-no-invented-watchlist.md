---
id: 0023
title: Don't tell a first-time visitor that Apple is "on your watchlist"
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-01
pr:
by: critic
---

## Evidence 2026-11-05 07:00 UTC (critic)
Still live: a fresh Playwright context (empty storage) opens AAPL's sheet with the button reading **"WATCHING"** (`src/lib/store.ts:11` seeds AAPL, NVDA, DIS).

## Why
`src/lib/store.ts:11` seeds every new browser with a watchlist of AAPL, NVDA and DIS. On a first visit at 390×844 (fresh context, nothing saved), Today's card 2 reads **"ON YOUR WATCHLIST · Apple Inc."** (screenshot `e-today-1.png`), and Compass, My Money and reminders treat those three as hers. For the Everyday persona, the whole promise is "does this affect *me*?", so claiming she owns or follows a stock she never added is invented data about her (common.md: never invent data). A shared Today link shows a stranger "your watchlist" too.

## What
- New visitors start with an empty watchlist. Keep the sample as an explicit "Try a sample watchlist" action.
- Today's personal card, when the watchlist is empty, becomes "Add the companies you own" (one tap to My Money or Hype Check), or uses "one of the week's biggest" wording instead of "on your watchlist".
- Existing visitors keep whatever is saved. Only the default changes.

## Acceptance criteria
- [ ] e2e with an empty localStorage at 390×844: `/today` contains no text "on your watchlist" and shows an add-companies prompt
- [ ] e2e: after adding AAPL, `/today` shows "On your watchlist · Apple Inc."
- [ ] Unit: the store's default `watch` is `[]`; the sample is loaded only by an explicit action
- [ ] Watchlist and Compass empty states give guidance, not a blank screen
- [ ] Works at 390×844 touch and 1440×900

## Test plan
`tests/unit` for store defaults. `tests/e2e/everyday.spec.ts` for both the empty and the added-watchlist Today flows (fixtures may need an explicit seed now).

## Out of scope
Importing a portfolio from a screenshot (0018).
