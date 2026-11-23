---
id: 0104
title: When the feed's session contradicts both Nasdaq and every recent report, Nasdaq's session leads, everywhere at once
status: shipped
priority: P1
size: M
lens: data-quality
created: 2026-11-23
pr: 184
by: builder
---

## Why
Split from 0102. Hormel (HRL) read "after close" for a before-the-open report: the feed said `amc`, while Nasdaq said `bmo` for the same day and the last four reports were all before the open. 0102 fixed HRL by hand with a company-sourced override. The next company like that shouldn't need one.

## What
- Why HRL slipped through: the 0060 contest (`worker/index.ts`, `contest` / `habit`) already sees feed `amc` vs Nasdaq `bmo`, and `contestedSession` settles the **habit** that past moves are measured on (bmo×4). The **headline** `next.session`, though, stays the feed's, with only `nasdaq` set beside it, so the sheet still leads with "After close". Fix the headline choice; don't change `contestedSession` itself, which 0060's sheet path, `/api/kids/why` and `contestedSession.test.ts` depend on.
- Rule (a new, separate predicate, e.g. in `shared/reaction.ts`): when Nasdaq lists the **same day** at the other timed session **and** every one of the last ≥3 measurable reports reacted on Nasdaq's session, the headline session is Nasdaq's (`hs: "n"`, "expected; the company hasn't said"), and the feed's session is named as the disagreement (the 0099 shape, applied to session instead of day).
- The calendar row can't see report history, so the sheet has to record its verdict where the calendar can read it (the 0083 contest memos, `rememberContests`/`readMemos`, within `XC_WRITES_PER_DAY`, or the `MS_KEY` memo). Then the calendar row, sheet, og card, story, ICS, Today and `/api/kids/why` all read the same answer.
- With no memo (nobody has opened the sheet yet), the calendar keeps today's "time unconfirmed" row and never states the feed's session as fact.

## Acceptance criteria
- [x] Unit: feed `amc`, Nasdaq `bmo` and history `bmo×4` yields `next.session === "bmo"` with the feed's `amc` named. With history mixed (2–2), the feed's session is kept and the disagreement is flagged.
- [x] Unit: the calendar row for that company reads `h: "bmo"` once the sheet has recorded it, and the ICS summary and share title agree.
- [x] A company-dated override always wins over the rule.
- [x] Works at 390×844 and 1440×900.

## Test plan
Beside `tests/unit/contestedSession.test.ts` and `leadDay0099.test.ts`, using made-up symbols (LESSONS 2026-11-06).

## Out of scope
A feed row with no session (0050/0091 cover that) and different-day disputes (0099).
