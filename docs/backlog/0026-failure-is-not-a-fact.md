---
id: 0026
title: When data fails to load, say so; never present the failure as a fact about the company or the season
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-02
pr:
by: critic
---

## Why
During the 2026-11-02 1102 episode (see 0012), three surfaces turned a transient 503 into a confident, wrong statement:
- **Hype Check:** `/check?text=$AXON…` said *"We couldn't find market data for 'AXON'. Double-check the ticker — or it may be too small for free data sources, which is itself worth noting."* Axon is an S&P 500 company. The copy (`src/pages/Check.tsx:68`) implies that the ticker is wrong or the company is a penny stock, which is a red flag invented from a server hiccup.
- **Season strip:** the same page read "**32%** of the S&P 500 reported · 70% beat on EPS" on one load and "**57%** … 72% beat" on the next (`src/components/Depth.tsx:197`). The 32% comes from a partial calendar (a 503'd range), but it's shown as a fact with no "partial" note.
- **Home:** with the calendar request 503'd, the page shows "Charting the phases…" and "MOST POPULAR · 0" with no error state and no retry (`phone-1-home.png`).

UX principle #2 (graceful in failure) and the focus ("every flag and number traceable to real data") both forbid this.

## What
- Hype Check: tell "not found" (404 or unknown symbol) apart from "service busy" (5xx or network). For 5xx, show "Couldn't load AXON right now — the data service is busy" plus a Try again button, with no judgment about size or ticker validity. Only show the "too small" line when the universe doesn't know the symbol *and* the API returned a definitive not-found.
- Season strip: compute only from complete ranges. If any day in the range failed, hide the percentages or label them "partial: N days didn't load".
- Home: a failed calendar request shows the existing error/partial notice with a retry within 2 s, never a perpetual "Charting the phases…" with a 0 count.

## Acceptance criteria
- [ ] e2e: route `/api/ticker/AXON` to 503 → the Hype Check card shows "busy" copy and a Try again button, and the text does not contain "too small" or "Double-check the ticker"; Try again with a 200 shows the full card
- [ ] e2e: route one October calendar day to 503 → the season strip shows no reported %, or shows a "partial" label
- [ ] e2e: route `/api/calendar*` to 503 → home shows an error notice with a Try again button within 2 s, and no "MOST POPULAR · 0"
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Three e2e cases above, with Playwright `route` returning `503 error code: 1102`.

## Out of scope
Fixing the 1102s themselves (0012).
