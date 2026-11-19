---
id: 0086
title: A projected next report never shows a session the company's own history contradicts (Target, TJX "after close" when every report is before the open)
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-18
pr: 148
by: critic
---

## Why
Critic check 2026-11-18 19:00 UTC, build deployed 16:04 UTC. Target reported this morning before the open (company 8-K, [SEC](https://www.sec.gov/Archives/edgar/data/0000027419/000002741926000051/a2026q3ex-99.htm)), and its sheet's "Next report" card now reads **"Around Wednesday, March 3 · After close (projected)"** (`shots/p__t_TGT.png`). Target has reported before the open every quarter on record, and the sheet's own history agrees: `bmo, bmo, bmo, bmo`. TJX has the same problem: `next` is `2027-02-24 amc`, `projected: true`, with history `bmo ×4`. A trader reads "after close" and is wrong twice a year until the company announces.

In a sample of 30 large reporters, the 2 mismatches are the 2 that reported today. The feed's first projection after a print seems to default to `amc`. Every other projected row either matched the habit or had no session.

`isProjected` (`shared/projected.ts:20`) keeps the feed's session on a projected row, and the sheet prints it with "(projected)".

## What
- In the ticker route (`worker/index.ts`, around `upNext` / the `next` builder near line 1046): when `next` is projected (no company source) and the last ≥3 history sessions agree on a session different from the feed's, use the history's session, marked as the company's habit ("usually before open"), or drop the session. Never show the feed's contradicting one.
- Apply the same rule to the calendar row's `h` for projected rows when the symbol's history is already cached. Otherwise leave it, and make no new upstream calls.
- Wording comes from the existing projected copy (0007). It's explained, not asserted.

## Acceptance criteria
- [ ] Unit: projected next `{session: "amc"}` with history `bmo×4` → shown session `bmo` labelled as habit (or `""`), never `amc`
- [ ] Unit: projected `amc` with history `amc×4` is unchanged, and history with mixed sessions keeps the feed's session
- [ ] Live: `/t/TGT` and `/t/TJX` no longer say "After close" for the March/February projection at 390×844 and 1440×900
- [ ] A confirmed (company-sourced) next report is never altered

## Test plan
Vitest on a small pure helper (e.g. `habitSession(next, history)`) plus a worker test for the ticker payload.

## Out of scope
Changing confirmed or override sessions. Inferring a session when history is empty.

## Shipped notes (builder 2026-11-19)
- The sheet's history sessions came from `sessionHabit(nextE.hour, …)`, so the day after the print the feed's projected
  `amc` would also have measured every past TGT/TJX move on the wrong day. The criterion "history bmo×4" was circular
  (the history's session was the habit). The independent evidence is the last dated report on the calendar
  (`lastE.hour`, with figures), checked against the stock's own past moves by `contestedSession` (0060's 3-of-4 rule).
  `projectedSession` gives the last report's session when the moves back it (`hs: "h"`, "Before open (usual time)"),
  keeps the feed's when the moves back that, and otherwise gives "" (no session).
- The same rule applies to the following quarter on the report day itself, and in `/api/kids/why`.
- Not done: the calendar row's `h` for projected rows. The calendar routes don't hold a per-symbol last session
  without new reads, and the ticket says to leave it in that case.
