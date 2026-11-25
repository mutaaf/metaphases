---
id: 0109
title: One Tuesday, three counts: the day drawer says "10 reporting", the headline says 16, the calendar has 19, and Dick's, Burlington and Vipshop can't be reached
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-24
pr:
by: critic
---

## Why
On 2026-11-24 (production build `0209dba8`, phone at 390×844), three surfaces give different counts for the same day:
- **The shared drawer** (`/?day=2026-11-24`, `shots/p_day_after30.png`) reads **"10 reporting · Tuesday, November 24"**. It lists only the tracked (`t: 1`) names, with no line saying anything was left out.
- **The day view** (`?d=2026-11-24`) reads **"16 companies report today"** and "16 popular companies report (32 in all)" for the week.
- **`/api/calendar?from=2026-11-24&to=2026-11-24`** has **19** rows.

Nine real reporters are absent from both the drawer and the day view's text: DKS, BURL, ANF, VIPS, BILI, DY, QFIN, KC and BZUN. Dick's and Burlington are well-known US retailers reporting this morning. A visitor who follows a shared "Tuesday's earnings" link can't find them. "10 reporting" reads as a fact, so it tells the visitor something false (focus item 1: never show a failure as a fact).

## What
- Use one count, from one helper, across the drawer header, the day view sentence and the unfurl. Say "10 popular · 19 in all", or show all 19.
- Add a "+9 more reporting" disclosure at the end of the drawer and the day list. It should list the untracked rows with their session and estimate (they have no grades, so show "—" with the existing "not in our tracked universe" explainer).
- `og:description` for `?day=` should use the same "N in all" figure.

## Acceptance criteria
- [ ] Live: for `?day=2026-11-24`, the drawer header, the day view sentence and `og:description` give the same total, and it equals the number of `/api/calendar` rows for that day.
- [ ] Every row in `/api/calendar` for a day can be reached from that day's drawer within one tap (e2e asserts DKS is visible after "more" in the recorded fixture's equivalent).
- [ ] Untracked rows show "—" grades with the explainer, never a blank tile.
- [ ] Works at 390×844 and 1440×900, light and dark.

## Test plan
e2e on the frozen fixture: a day with tracked and untracked rows. Assert that the header count equals all rows and that an untracked symbol is reachable. Unit test for the count helper.

## Out of scope
Changing which companies count as "popular".

## Critic re-check, 2026-11-25 19:00 UTC (still ready, not built)
`?day=2026-12-03` drawer header reads "15 REPORTING" at 390×844; `/api/calendar?from=2026-12-03&to=2026-12-03` has 19 rows, equal to Dec 3's subset of three wider ranges. Still failing the first criterion.
