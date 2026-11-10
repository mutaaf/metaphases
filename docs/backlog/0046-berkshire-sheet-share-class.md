---
id: 0046
title: Berkshire's sheet skips its next report and shows Class A figures on the B share ($8,202.91 EPS on a $577 stock)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-05
pr: 81
by: critic
---

## Why
Critic check 2026-11-05 19:00 UTC, build `f06e052c`. BRK.B is the largest tracked financial ($1.24T) and the sheet is wrong on four lines at once (`/t/BRK.B`, 390×844 and 1440×900):

| Line | Metaphases (live) | Primary source |
|---|---|---|
| Next report | **Q4 · Friday, February 26 · in 113 days**. The Read: "reports Q4 on Friday, Feb 26" | Berkshire hasn't filed its Q3 2026 10-Q yet (EDGAR submissions, last 8-K item 2.02 is the Q2 release on Aug 8). Q3 normally posts on the first Saturday of November (Nov 1 2025). Nasdaq lists BRK.B on Nov 6. **The coming Q3 report is skipped entirely** |
| EPS estimate | **$8202.91**, "versus $9038.30 last quarter", on a $577.05 share | Q2 2026 release ([8-K ex. 99.1](https://www.sec.gov/Archives/edgar/data/1067983/000119312526344495/d159922dex991.htm)): net earnings per Class A share $17,868, **per Class B share $11.91**; "Per share amounts for Class B shares are 1/1,500th of those shown for Class A". The feed's numbers are per A share |
| History dates | `2026-06-30`, `2026-03-31` (quarter ends) with no session | Q2 was released Aug 8, 2026 (8-K). Nasdaq `earnings-surprise` for BRK.B answers "No record found", so the dates fall back to the period |
| Setup | "Partial picture: Price history unavailable" | Yahoo needs `BRK-B`; the quote works, the history doesn't |

A first-time investor reads "$8,202.91 a share" on a $577 stock and concludes the data is broken, or worse, that Berkshire earns 14× its price each quarter. A Berkshire holder gets no warning that results land this weekend.

## What
- Share-class scale: for BRK.B (and any tracked class with a published ratio), divide Finnhub's per-share EPS figures (estimate, actual, history, The Read, og:description, Retrace) by 1,500, or show "—" with a note. Keep the ratio in one place (`shared/` constant or a `universe.json` field), with the source.
- A skipped quarter: when the sheet's `next` is two fiscal quarters after the last reported one (Q2 reported, next is Q4), don't present the later date as "next". Show "Q3 report expected, date not announced" (reuse 0045's not-confirmed treatment), and add a `data/date-overrides.json` entry once Berkshire posts its notice.
- History: when Nasdaq has no record, don't label a quarter-end date as the report date; show the period, or "—" for the date.
- Price history: map dotted symbols to Yahoo's dash form (`BRK.B` → `BRK-B`) for chart calls.
- Files: `worker/index.ts` (ticker route), `shared/` symbol helpers, `src/components/TickerSheet.tsx`.

## Acceptance criteria
- [ ] Production `/api/ticker/BRK.B`: `next.epsE` and `history[].epsA` are within 1/1,000 to 1/2,000 of today's values (B-share scale), and The Read never shows a four-digit EPS for BRK.B
- [ ] `/api/ticker/BRK.B` `next` is not Q4 2026 while Q3 2026 is unreported; the sheet says the Q3 date isn't announced (or shows Berkshire's own date once it exists, with its source)
- [ ] `history[0].date` is never a quarter-end date presented as a report date
- [ ] `/t/BRK.B` has no "Price history unavailable" warning and shows a setup grade or typical move
- [ ] Unit test: a fixture with Class A-scale EPS for BRK.B renders B-scale; a fixture whose `next` skips a quarter gets the not-confirmed treatment
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Unit on the scale helper and the skipped-quarter rule; a BRK.B ticker fixture in e2e asserting the EPS cell and the date line.

## Out of scope
Finding Berkshire's Q3 date before it's announced. Other share-class pairs (GOOGL/GOOG and similar have equal per-share figures).
