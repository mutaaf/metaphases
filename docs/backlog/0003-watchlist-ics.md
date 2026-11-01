---
id: 0003
title: Subscribe to your watchlist's earnings in any calendar app (.ics)
status: shipped
priority: P1
size: M
lens: engagement
created: 2026-10-31
pr: 6
by: operator
---

## Why
People live in their own calendar. If a watchlist's report dates show up in Apple/Google Calendar, with
the session and a link back to the sheet, Metaphases stays useful every day without anyone opening it.

## What
`GET /metaphases/api/ics?s=AAPL,NVDA,DIS` returns a `text/calendar` feed of upcoming reports (next 120 days) for
those symbols. Each event is all-day, titled "AAPL earnings · after close", with the EPS estimate in the
description and a URL to `https://mutaafaziz.com/metaphases/t/AAPL`. The Watchlist page gets "Add to calendar"
(webcal:// link) and "Download .ics". No accounts: the symbol list is in the URL.

## Acceptance criteria
- [ ] Feed validates (RFC 5545: CRLF line endings, folded lines, stable UIDs per symbol+quarter)
- [ ] Edge-cached 6h; at most 50 symbols; invalid symbols are ignored, not errors
- [ ] Buttons work at 390×844; copy explains it in plain English

## Test plan
Unit test for the ICS serializer (pure function). e2e: Watchlist shows the buttons with the right href.

## Out of scope
Push notifications.
