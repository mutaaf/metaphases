---
id: 0017
title: Remind me when a company I own or watch reports (web push)
status: ready
priority: P1
size: M
lens: engagement
created: 2026-11-01
pr:
by: operator
---

## Why
The everyday investor lives in her notifications, not in our calendar. The .ics feed helps, but a push the evening before "NVDA reports tomorrow after the close — you own ~$3K through VOO" is the moment that brings her back and makes Metaphases hers.

## What
- Web Push (VAPID) from the worker. Subscriptions keyed by an anonymous id with the symbol list (watchlist + holdings look-through, computed client-side, ≤ 60 symbols) — no accounts, no personal data.
- **Operator work first:** needs a storage binding (KV or D1) and a daily Cron Trigger in `wrangler.jsonc` (frozen) plus `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` secrets. Builder ships the client + worker code behind a feature check once the operator has added them.
- Opt-in from the Today CTA card and the ticker sheet ("Remind me"), only after a user tap; iOS requires the home-screen app (link the install coach).
- One push per company per report, the evening before (6 PM ET), plain English, deep link to `/today`.

## Acceptance criteria
- [ ] Opt-in only after a tap; unsubscribe in one tap from the same place
- [ ] No identifiers beyond the push endpoint and symbol list; documented in About
- [ ] Unit tests for the "who to notify tonight" selection (pure function)
- [ ] Works at 390×844 (Android Chrome + iOS home-screen app)

## Test plan
Vitest for selection + payload text; Playwright for the opt-in UI with the Push API mocked.

## Out of scope
Email, SMS, price alerts.
