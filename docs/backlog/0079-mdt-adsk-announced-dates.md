---
id: 0079
title: Medtronic and Autodesk announced Nov 24 two weeks ago, but their sheets say "Date not yet confirmed by the company · Time TBD"
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-16
pr: 133
by: critic
---

## Why
Critic check 2026-11-16 19:00 UTC, build `2674bacd`. Both companies have published their date and time:

- **MDT**: Medtronic, Nov 4: Q2 FY27 results Tue Nov 24, news release 5:45 a.m. CT, webcast 6:30 a.m. CT ([Medtronic newsroom](https://news.medtronic.com/2026-11-04-Medtronic-to-announce-financial-results-for-its-second-quarter-of-fiscal-year-2027)). That's before the open.
- **ADSK**: Autodesk, Nov 2: Q3 FY27 call Tue Nov 24, 2 p.m. PT ([wire copy](https://finviz.com/news/413095/autodesk-extends-invitation-to-join-financial-results-conference-call)). That's after the close.

Metaphases: `/api/ticker/MDT` and `/api/ticker/ADSK` are `{2026-11-24, session: "", projected: true}` and the calendar rows have a blank `h`. The MDT sheet at 390×844 reads "Around Tuesday, November 24 · Time TBD · Date not yet confirmed by the company. The date shown is our data feed's projection…" (`shots/p_mdt.png`), which is false. The og titles say "before the open (expected)" / "after the close (expected)", so the share card and the sheet disagree on the session. On the calendar both sit under "Time TBD" in the Nov 24 cell, the busiest day of the week (9 popular names).

Same class as 0052, 0055, 0063, 0068, 0069 and 0075 (overrides for announced dates the feed missed).

## What
- Add MDT (2026-11-24, bmo) and ADSK (2026-11-24, amc) to the company-date overrides with the source URLs above.
- Sweep the other tracked Nov 23–Dec 4 rows with a blank session or `projected: true` (DELL, BBY, SJM, CPRT, ADSK, MDT on the calendar today) for a company notice; add an override for each one found, and list the ones without a notice in the PR.

## Acceptance criteria
- [ ] `/api/ticker/MDT` → `{date: 2026-11-24, session: bmo, confirmed: <Medtronic URL>}`; `/api/ticker/ADSK` → `{2026-11-24, amc, confirmed}`
- [ ] The MDT sheet no longer says "Date not yet confirmed by the company"; og:title has no "(expected)"
- [ ] Calendar rows carry `o` and the session in every range that includes Nov 24 (Nov 23–27, Nov 24 alone, Nov 16–Dec 4)
- [ ] Unit: the override table's validator accepts both rows (dated source, session)
- [ ] Works at 390×844 touch and 1440×900

## Builder notes (2026-11-17)
- MDT (5:45 a.m. CT release) and SJM (7:00 a.m. ET release, found in the sweep) are `bmo`, stated.
- ADSK (2 p.m. PT call) and DELL (3:30 p.m. CST call, results "before the conference call") name a call time only, so they are **date-only** overrides: `/api/ticker/ADSK` is `{2026-11-24, session: "", confirmed}`, not `amc`. That follows the overrides `_readme` and the LESSONS rows "a call time alone isn't a session" (MRVL, ROAD, INTU). The date is confirmed; the session reads "Time TBD".
- No company notice found for BBY (IR site 403, no wire headline) or CPRT (Copart doesn't pre-announce; its Nov 18 row is outside Nov 23–Dec 4). Left on the feed.

## Test plan
Override-table unit tests; e2e unchanged (live data).

## Out of scope
Automatic discovery of company IR announcements (would need a new host).
