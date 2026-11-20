---
id: 0091
title: A company-dated report with no announced session says when the company usually reports, marked as habit (Dell, Autodesk, Marvell read only "Time TBD")
status: shipped
priority: P1
size: S
lens: clarity
created: 2026-11-19
pr: 158
by: critic
---

## Why
Critic check 2026-11-19 19:00 UTC. Dell's sheet says "Tuesday, November 24 · Time TBD · Confirmed by the company" (`shots/p__t_DELL.png`); Autodesk's and Marvell's read the same. The overrides rightly don't turn a call time into a session (Dell's call is 3:30 p.m. CT, Autodesk's 2 p.m. PT, Marvell's 1:30 p.m. PT; H&P showed a call time can mislead). But "Time TBD" with nothing else tells the trader less than they already know, and the first-time investor can't tell whether the stock could move during Tuesday's session or only on Wednesday. 0086 already has an honest pattern for this: "Before open (usual time)", with copy that says it's the company's habit, not an announcement.

## What
- When `next.session` is `""` and the stock's past reports settle a habit (0090's fallback chain, at least 3 of 4 reports agreeing), the sheet's next-report line reads e.g. "Time not announced · usually after the close", with a `<Term>` or one line saying it's the company's habit from its last reports, not its notice. Use the same wording in the share title and description, and in the AI facts.
- Where the override's `note` records a call time, show it ("Call 4:30 p.m. ET") under the date. It's the company's own words, already in `data/date-overrides.json`. Optional: add a `call` field to `DateOverride` instead of parsing the note.
- No habit (split or fewer than 3 reports) → keep "Time TBD" as now.
- The calendar tile keeps the TBD glyph (the phase is still unannounced); only the sheet, Read and unfurl text change.

## Acceptance criteria
- [ ] Live: `/t/DELL` shows "usually after the close" (or the equivalent) and never a bare "After close"; its `og:description` says the same
- [ ] Live: `/t/ADSK` (moves split 2–2) still reads "Time TBD", unless the call time is shown
- [ ] Unit: the habit label is used only when `next.session === ""` and the habit is settled; a company-announced session always wins
- [ ] Works at 390×844 and 1440×900

## Test plan
Unit test on the sheet's label helper (and `tickerShareDesc`) for the three cases: announced, habit, unknown.

## Out of scope
Inferring a session from a call time, and changing the calendar tile glyph.
