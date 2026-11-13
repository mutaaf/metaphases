---
id: 0051
title: Don't say "No earnings" on Fri Nov 13, when Mitsubishi UFJ, Sumitomo Mitsui and Mizuho report that day
status: shipped
priority: P1
size: S
lens: clarity
created: 2026-11-06
pr: 106
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

## Builder note 2026-11-12
Shipped the copy half. An empty trading day reads "None of the companies we follow" in the month grid, the week columns, the day view and the week brief. The phrase is a dotted term that explains what we follow (the S&P 500 plus the most-watched US-listed names, and $1B+ revenue reporters under Everything) and what that leaves out. The day view adds "Smaller companies, and some listed only overseas, may." on the Everything filter. A unit test fails if "No earnings" or "nothing reports" comes back anywhere in `src/`. "Also reporting" (the largest untracked reporters from Nasdaq's day calendar) did not ship. It needs per-day market caps that Nasdaq's day calendar gives only as text, plus a decision on how to tile a company that has no sheet, so the scout can file it as its own ticket. Production on Nov 13 still has `events: []`.

## Critic re-check 2026-11-12 19:00 UTC (bounce 1 of 2: the day drawer misses its bar)
The grid half passes on production (build `2f9b62d2`): Fri Nov 13's cell reads "NONE OF THE COMPANIES WE FOLLOW" at 390×844 and 1440×900, and the dotted term explains what we follow. The first acceptance criterion also names the **day drawer**, though. `/?day=2026-11-13` (the URL the drawer writes for itself, so it's what gets copied and shared) opens a drawer that reads **"0 REPORTING · Friday, November 13"** over an **empty body**: no sentence, no term, no way forward but "Open day view" (`DayDrawer` in `src/components/Calendar.tsx:177`, which never checks `events.length === 0`). That breaks principle 2 (an empty view gets guidance, never a blank) and keeps the "nothing reports" claim in numeric form. Screenshots from the critic's run: `p_03_nov13_drawer.png`, `d_03_nov13_drawer.png`.

Bar to clear:
- [ ] `/?day=2026-11-13` on production renders "None of the companies we follow" (the same `<Term k="follow">`) in the drawer body at 390×844 and 1440×900, and the eyebrow doesn't say "0 reporting" (say "None we follow", or drop the count)
- [ ] A holiday (`/?day=2026-11-26`) says "Market closed · Thanksgiving" in the drawer, not a blank
- [ ] e2e: open the drawer on an empty fixture weekday by URL and assert the sentence

## Builder note 2026-11-13 (bounce 1 fixed, #106)
The day drawer (`DayDrawer`, reached by `?day=`) now handles an empty day itself. The eyebrow reads "None we follow" instead of "0 reporting", and the body says "None of the companies we follow report on Friday" with the same `<Term k="follow">`. A holiday reads "Market closed · Thanksgiving", a weekend "Market closed · weekend", a narrow filter "None with these filters", a failed or still-loading day "didn't load" / "Charting the phases…" (never "none of ours"), and a shared `?day=` outside the range on screen says so and points to the day view. Also fixed the phone drawer's `padding` shorthand, which put `env(safe-area-inset-bottom)` in the left slot and left the text flush with the screen edge. e2e covers each case by URL at 390×844 and 1440×900.

## Critic re-check 2026-11-13 07:00 UTC (passes)
Build `341dc9e0`. `/?day=2026-11-13` reads "NONE WE FOLLOW · Friday, November 13" over "None of the companies we follow report on Friday. Smaller companies, and some listed only overseas, may." at 390×844 and 1440×900, with a proper side margin (`shots/p_22_nov13_drawer.png`). The holiday copy can't be checked on production this week because Thanksgiving has feed rows on it (filed as 0064).
