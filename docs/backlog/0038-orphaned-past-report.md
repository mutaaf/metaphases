---
id: 0038
title: Never drop a report whose projected date passed without a result (AXON's Nov 5 report now shows as "Feb 22")
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-03
pr:
by: critic
---

## Update, critique 2026-11-04 07:00
**17** past-dated rows (Oct 28 – Nov 3) with no actual now, up from 6: ADM, AES, BC, BLD, CWK, FDXF, HUBG, K, ODP, PAA, ROKU, SEE, SEM, SPR, TECH, UI, WES. There are two kinds, and the fix must tell them apart:
- **Not reported yet; Nasdaq has a future date** (the true orphans): WES Nov 4 (confirmed by the company, amc), TECH Nov 4, CWK Nov 4, HUBG Nov 5, PAA Nov 6 (confirmed by the company, bmo) and UI Nov 6. Every one of their sheets skips to Q4 (WES "Feb 16", PAA "Feb 4", TECH "Feb 2").
- **Reported, but the calendar has no actual** (0040 territory): ADM (8-K Nov 3), BC (Nasdaq 10/29 $1.58), ROKU (company letter Nov 2), FDXF (10/29 $1.49, which is also a duplicate row, see 0041).
The sweep bar stands. Use Nasdaq's `earnings-surprise` latest `dateReported` to decide which kind a row is.

## Update, critique 2026-11-03 19:00
Spreading: **six** past-dated tracked rows with no actual now (AES, AXON, BLD, HUBG, SEE, WES), up from two. **WES** is confirmed: Western Midstream (Oct 19) releases **Wed Nov 4 after the close**, and Nasdaq agrees, yet the sheet says "NEXT REPORT · Q4 2026 · Tuesday, February 16 · in 105 days" (`p_t_WES_sheet.png`) and `/t/WES` unfurls "WES reports Tue, Feb 16". HUBG: Nasdaq Nov 5, sheet Feb 3. **FIS is next:** its Finnhub row is Tue Nov 3 bmo with no actual (the company moved to Nov 4), so from Nov 4 00:00 ET its sheet will skip to Q4 too. The sweep criterion above stands: 0 names whose `next.quarter` skips an unreported quarter.

## Why
Critique 2026-11-03 07:00 #1. Finnhub dated AXON's and AES's Q3 reports **Mon Nov 2** with a blank session (projections). Axon's own release (Oct 22) says **Thu Nov 5 after the close**, and Nasdaq lists AES on Nov 3. Once Nov 2 passed with no actual:
- `/api/calendar` keeps a dead row on Nov 2 (`eA: null`, `h: ""`), which looks like a report that happened and had no result;
- `/api/ticker/AXON` `next` jumps to **2027-02-22 (Q4)**, so the sheet says "reports Q4 on Monday, Feb 22" and `/t/AXON` unfurls "AXON reports Mon, Feb 22 after the close";
- AES's `next` is 2027-02-24.
A trader holding AXON into Thursday's print is told there's nothing for 16 weeks. Any early projection becomes an invisible report, so this isn't limited to AXON.

## What
- In the sheet's `next` selection (`worker/` ticker route), if the most recent calendar/Finnhub event for this symbol is in the past with `epsActual == null` and is the quarter after the last reported one, treat that quarter as **still pending**: `next = { ...thatEvent, date: null or the best other-source date, status: "overdue" }`. Never skip to a later fiscal quarter while an earlier one has no actual.
- When Nasdaq's per-day calendar (0015) or a company override (0013) has a future date for that quarter, use it. Otherwise show "Date passed without results · new date not confirmed".
- In `/api/calendar`, a past-dated tracked event with no actual after its day plus 1 trading day moves out of the "reported" styling: render it as "Expected, didn't report this day" (no beat/miss tint), and include it in a `warnings`-style `overdue[]` list.
- Share meta (`/t/:sym`) never claims a next date beyond an unreported earlier quarter.

## Acceptance criteria
- [ ] Unit test with recorded AXON rows (Q3 2026-11-02 `eA:null`, Q4 2027-02-22) and clock 2026-11-03: `next.quarter === 3`, not 4, and the date is null or the other-source date
- [ ] `/t/AXON` og:title at that state never says "Feb 22"; it says "AXON's Q3 report is overdue · date not confirmed" (or the confirmed date)
- [ ] Calendar fixture: a past event with no actual renders without a beat/miss tint and with the overdue label at 390×844 and 1440×900
- [ ] The critic's next sweep finds 0 tracked names whose `next.quarter` skips an unreported quarter (sweep: for each universe name, last history period vs `next.quarter`)
- [ ] Loading / empty / error / partial states handled

## Test plan
Vitest on the next-report selector (pending quarter kept, override used, Nasdaq date used, Q4 only after Q3 has an actual). e2e on fixtures for the overdue calendar cell and the sheet line.

## Out of scope
Fixing the projected date itself (0013 overrides, 0015 Nasdaq cross-check). No new hosts.

## Builder note 2026-11-04 (PR #51 self-review)
An override that has to *create* the row loses the estimates: `applyToRows` (sheet, `/t/` share meta, .ics) never has the Q3 row because `symbol=` returns future dates only, and `applyToEvents` drops them whenever the requested range leaves out Finnhub's original day (Today's `from=2026-11-04&to=2026-11-13` → WES and PAA `eE:null`). Carry the calendar's estimate for that quarter over (e.g. from the cached per-day calendar row) when you fix 0038; `tests/unit/dateOverridesWorker.test.ts` pins today's "no estimate, never Q4's" behavior.
