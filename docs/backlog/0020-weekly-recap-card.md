---
id: 0020
title: Weekly shareable recap: "your week in earnings" story card
status: ready
priority: P2
size: S
lens: growth
created: 2026-11-01
pr:
by: operator
---

## Why
Socials run on recaps. A Friday-evening 9:16 card — "Your companies this week: 3 reported, 2 beat, NVDA moved +8%" — is something she'd post, and every post is a link back.

## What
- A `recap` story at the end of Today on Fri/Sat/Sun, built from the week's reported events for her watchlist + holdings (falls back to the biggest names).
- Worker route `/og/story/recap.png?s=…` (symbols in the query, ≤ 12) reusing `shared/story.ts` + the resvg pipeline.

## Acceptance criteria
- [ ] Only real reported results; "no reports this week" handled
- [ ] Card text fits at 1080×1920 for 12 symbols
- [ ] Share uses the same native-share / download path as Today

## Test plan
Unit test the recap aggregation and SVG text; Playwright that the card appears on a Saturday with the share button.

## Out of scope
Push delivery of the recap (see 0017).
