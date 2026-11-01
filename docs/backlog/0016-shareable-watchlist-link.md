---
id: 0016
title: Share your watchlist as a link that unfurls ("my 12 reports this week")
status: ready
priority: P2
size: M
lens: growth
created: 2026-11-01
pr:
by: scout
---

## Why
Launch focus (4): every surface should unfurl beautifully. Watchlists live only in localStorage and the `.ics` feed (0003), so a user can't send a friend or group chat "here's what I'm watching this season". A link that rebuilds the list and unfurls with a specific title is the cheapest growth loop, with no accounts.

## What
- New route `/w?s=AAPL,MSFT,…` (max 40 valid symbols, validated against the universe, de-duplicated). It renders the Watchlist page with those symbols in a read-only "Shared list" view and an "Add all to my watchlist" button, which is the only action that writes to localStorage.
- Worker share meta (`PAGES`): title "12 earnings to watch · Metaphases", description naming the next three reporters and dates; reuse `og.png`. Unknown symbols are ignored; an empty list falls back to the generic page.
- A "Copy link" button on the Watchlist page (clipboard with a fallback to a selectable field).
- Files: `worker/index.ts`, `src/pages/Watchlist*`, `src/lib/router.ts`, `src/lib/store.ts`.

## Acceptance criteria
- [ ] `curl /w?s=AAPL,MSFT` returns 200 with a title containing the count and an og:description naming real next-report dates; `/w?s=` and junk symbols return the generic page, never a 500
- [ ] The shared view never touches localStorage until "Add all" is tapped
- [ ] Uses `href()`/`BASE`, with no root-relative URLs
- [ ] Works at 390×844 touch (targets ≥ 40px) and 1440×900, no horizontal scroll
- [ ] Loading / empty / error / partial states handled (e.g. a symbol with no upcoming date shows "—")

## Test plan
Unit: parse/validate/cap the symbol list; share-meta builder. e2e: open `/w?s=…`, see the list, tap "Add all", and check the watchlist persists.

## Out of scope
Accounts, short links, or syncing across devices.
