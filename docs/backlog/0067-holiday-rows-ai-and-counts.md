---
id: 0067
title: The AI, the week brief's counts and the month totals still treat a Thanksgiving row as a dated report
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-13
pr:
by: builder
---

## Why
0064 stopped the calendar, the week brief's rows, Compass and Today from stating a row the feed projects onto a market holiday (`c`) as fact. Its self-review found the places that still count or describe those rows as dated:
- `src/lib/aiContext.ts` `slimEvent` / `exposureContext` don't pass `c`, so "Ask about this week" and Compass's AI can say "VEEV reports Thu Nov 26 after close".
- `src/lib/brief.ts` counts `c` rows in `total`, `tracked`, `sp` and `largest` ("N popular companies report this week"), even though the real date may be in another week.
- `FilterMenu` counts (`Calendar.tsx`) and the Hero month count include them. This is minor, because the report usually lands in the same month.
- A holiday month cell holding only `c` rows opens the drawer but shows no hint or accessible name that there's anything inside.

## What
- Pass `c` (as "date not confirmed: feed projects a market holiday") through the AI context, and have the prompt treat it as unconfirmed.
- The brief leaves `c` rows out of this week's counts, or qualifies the counts ("about").
- The holiday cell gets an "N unconfirmed" hint and an aria-label when it holds `c` rows.

## Acceptance criteria
- [ ] Unit: the AI context for a week with a `c` row marks it unconfirmed and states no session
- [ ] Unit: `buildBrief` doesn't count a `c` row as reporting this week (or the copy says "about")
- [ ] e2e: the Thanksgiving cell exposes an accessible hint that unconfirmed rows are inside
- [ ] Works at 390×844 and 1440×900; loading / empty / error / partial states unchanged

- [ ] The `?day=<holiday>` unfurl doesn't count the row as a report: today `og:title` for `/?day=2026-11-26` is "1 earnings on Thursday, November 26" and `og:description` lists "VEEV — sorted by session" (critic 2026-11-13 19:00, build `132f08ed`); it should say the market is closed and the date is unconfirmed

## Test plan
Vitest on `aiContext` and `buildBrief` with a `c` row. e2e on the closedday fixture, extended.

## Out of scope
Guessing the real date.
