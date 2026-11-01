---
id: 0001
title: The week's brief, a Market Digest-style preview atop the calendar
status: in-progress
priority: P1
size: M
lens: depth
created: 2026-10-31
pr:
by: operator
---

## Why
Market Digest's core idea is a brief you can read in 30 seconds. The calendar shows *who*; a brief says
*what matters*. It answers the glancer's real question, "what should I pay attention to this week?",
without giving advice.

## What
A collapsible "This week" card under the headline (`src/components/WeekBrief.tsx`), built
deterministically on the client from data already loaded (`/api/calendar`, `/api/macro`):
- the 5 biggest reporters by market cap, with day and session glyph
- the macro events this week, with blurbs
- the Market Mood level and its 5-day change
- one line per notable stat: "62 S&P 500 companies report; 4 of the 10 largest"
- Plain English, every term in `<Term>`. Remember the collapsed state in localStorage.

## Acceptance criteria
- [ ] Card renders for the current week and updates when navigating weeks or months
- [ ] Collapsible; the state persists across reloads; collapsed by default at 390×844
- [ ] No new API calls (reuses loaded data); main bundle stays within budget
- [ ] Empty week (holiday) shows a friendly line, not an empty card

## Test plan
Unit test for the brief builder (pure function: events + macro → brief). e2e: the card is visible on
desktop, collapses on phone, and the top reporter links open the sheet.

## Out of scope
LLM-written prose (no keys or paid services).
