---
id: 0080
title: A report the company never made is shown as fact (UiPath "Just reported Nov 12 · missed by 44%"; its Q3 is Dec 3)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-17
pr: 137
by: critic
---

## Why
Critic check 2026-11-17 07:00 UTC, build `ec1b5d00`. The feed has a UiPath row on **Thu Nov 12** with figures (`eE 0.1954, eA 0.11, rA 354.7M`, session `dmh`). Every surface states it as a report:

- Sheet `/t/PATH` at 390×844: "JUST REPORTED · Q3 2027 · Thursday, November 12, during hours · EPS $0.11 · Expected $0.20 · Missed by 44%" in red (`shots/p_PATH.png`). The reaction table adds "Nov 12 '26 $0.20 → $0.11 −43.7% −0.3%".
- The Nov 12 drawer: "5 REPORTING … DURING HOURS · 1 · PATH … MISS −44%".
- og:title "PATH reported Q3: $0.11 a share vs $0.20 expected".
- Next report: "Around Tuesday, March 9 (projected)", which skips the real Q3 report.

UiPath didn't report on Nov 12. On **Nov 5** it announced Q3 FY2027 results for **Thu Dec 3, after the close**, call 5 p.m. ET ([company release](https://investingnews.com/uipath-announces-third-quarter-fiscal-2027-financial-results-conference-call/)). Nasdaq's `earnings-surprise` history for PATH ends at 9/3/2026, 70 days before the row. The figures look like stale or misfiled data (revenue $354.7M against Q3 guidance of $440–445M).

`settlePast` (`shared/pastRows.ts`, `needsPastCheck`) only looks at rows **without** figures, so a row the feed fills with figures is never checked against the company's history. Of the 92 tracked past rows from Oct 19 to Nov 17 that have figures but no Nasdaq match (`pr`/`nd` absent), PATH is the only one with no Nasdaq report within 4 days (the other 87 that Nasdaq answered for are within 1–2 days; KVUE, L, ROKU and CPT didn't answer). It's one row, but it's a red "Missed by 44%" on a company that hasn't reported, which is the worst kind of wrong for focus item 1 ("no failure ever shown as a fact").

## What
- Check past rows **with** figures too: when the company's history (the same `nq:surprise:SYM` read) is available, has a newest report more than `OVERDUE_GAP_DAYS` before the row, and has nothing within one trading day of it, the feed's figures aren't a report. Mark the row (for example `od` plus a flag that figures were withheld, or a new `pf: true`), drop it from beat/miss counts, the season strip and Retrace, and show it under "Date not confirmed" like 0072's rows.
- The sheet's "Just reported" card and the reaction table skip such a row; og and the AI facts follow.
- Keep the rule tight: a row Nasdaq hasn't posted yet (within `OVERDUE_AFTER_TRADING_DAYS`) or a company with no readable history is left alone.
- Add the PATH override (Dec 3, amc) in 0081 so the sheet's next report is right; this ticket is the code path.

## Acceptance criteria
- [ ] Unit: a PATH-shaped row (`d` 2026-11-12, figures present, history newest 2026-09-03, today 2026-11-17) → flagged, not judged; the same row with a history entry on 11-12 or 11-13 → unchanged; a row 2 trading days old → unchanged
- [ ] `/api/calendar?from=2026-11-09&to=2026-11-13` has no judged PATH row; the Nov 12 drawer reads "4 reporting" and lists PATH under "Date not confirmed"
- [ ] `/api/ticker/PATH` has no `history` entry dated 2026-11-12 and no "Just reported" state; og:title has no "reported Q3"
- [ ] The season strip / beat counts don't include the row
- [ ] e2e on fixtures at 390×844 and 1440×900 with a phantom-figures row
- [ ] Loading / empty / error / partial states handled (a failed history read leaves the row as is, never a 500)

## Test plan
Vitest on `shared/pastRows.ts` (`settlePastRow` with figures) and the sheet's history builder; extend the closed/overdue day-drawer e2e spec with one phantom row.

## Out of scope
Correcting the feed's figures; finding the real date (0081 does that for PATH).
