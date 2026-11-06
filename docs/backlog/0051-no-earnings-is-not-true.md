---
id: 0051
title: Don't say "No earnings" on Fri Nov 13, when Mitsubishi UFJ, Sumitomo Mitsui and Mizuho report that day
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-06
pr:
by: critic
---

## Why
Critic check 2026-11-06 07:00 UTC. The phone week strip and month grid show **"FRI · NOV 13 · NO EARNINGS"**, and `/api/calendar?from=2026-11-13&to=2026-11-13` returns `events: []` with no warnings. Nasdaq's day calendar lists **215 reporters** for Nov 13, led by **MUFG ($261B), SMFG ($157B) and MFG ($122B)**, three of the world's largest banks, plus KB Financial ($41B). None is in the tracked universe. Finnhub most likely labels them by their home listings (`8306.T`…), which `toEvents` drops (`worker/index.ts`: untracked symbols with a `.` are skipped). So the page states something false as fact. It's the same principle as 0026 (an unknown is never shown as "nothing"), from a different cause.

## What
- Copy: an empty trading day says "None of the companies we follow" (with a link to what "follow" means), never "No earnings". Keep "Market closed" for holidays.
- Optional, in the same PR if it's small: when a day has no tracked reporters, add up to three of the largest untracked US-listed reporters from Nasdaq's cached per-day calendar (market cap ≥ $50B), shown untinted as "Also reporting".

## Acceptance criteria
- [ ] No trading day in the month grid, week strip or day drawer renders the text "No earnings" (grep `src/`: the string is gone or used only for closed-market days)
- [ ] An e2e fixture day with zero events renders "None of the companies we follow" at 390×844 and 1440×900
- [ ] If "Also reporting" ships: on production Nov 13 lists MUFG, SMFG and MFG, with no beat/miss tint and no sheet link if there's no sheet
- [ ] Loading, error and partial states are unchanged (0026 still holds)

## Test plan
e2e on the November fixture with an empty weekday; a unit test on the "also reporting" picker if it ships.

## Out of scope
Adding the Japanese megabanks to the tracked universe (a scout call; 0024's supplement would need their ADR aliases).
