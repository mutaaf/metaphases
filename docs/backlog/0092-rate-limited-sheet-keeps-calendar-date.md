---
id: 0092
title: A sheet whose Finnhub reads are rate-limited still shows the date and session the calendar already has (ZM, HPE, HPQ, WDAY read "Upcoming date unavailable")
status: ready
priority: P1
size: M
lens: data-quality
created: 2026-11-19
pr:
by: critic
---

## Why
Critic check 2026-11-19 19:00 UTC. Reading 67 sheets about 0.3 s apart (roughly what a dozen people tapping through peak week do: each cold sheet costs several Finnhub calls against one 60-a-minute key), these sheets came back with no date and no history:

| Sheet | `warnings` | The calendar at the same time |
|---|---|---|
| ZM | Company profile, fundamentals, upcoming date, history, ratings unavailable | Mon Nov 23, after close (company: Nov 23 after close) |
| HPE | history, ratings, upcoming date | Mon Nov 23, after close |
| HPQ | profile, fundamentals, upcoming date, history, ratings | Tue Nov 24, after close (company: Nov 24, 5 p.m. ET call) |
| WDAY | same five | Tue Nov 24, after close (company: Nov 24 after close) |
| NTES | upcoming date, history, ratings | reported this morning |

Two minutes later, read 4 s apart, all five were complete. So this is load, not a broken upstream, but it's exactly the load of peak week, and the 0043 stand-in (`tk:stale:v7`) only helps on a colo that has built that sheet before. The sheet then shows "Upcoming date unavailable" for a company the calendar on the same page lists, with a confirmed source for some. Operator focus (1): no failure shown as fact, and partial data beats nothing.

## What
- `tickerEntry` / `buildTicker` (`worker/index.ts` ~690–730): when the `symbol=` read fails and no usable stale copy exists, take `next` from the calendar's cached day rows (`CAL_DAY` / `cal:stale:v3`, cache only, the same reads `lastReportedHour` makes, next 14 weekdays), with overrides applied (`activeOverrides`). Keep the "earlier read" marking, and keep the 5-minute degraded TTL (0043).
- If the Nasdaq history read succeeded, keep the past dates and moves even when Finnhub's history failed (borrow only what's missing).
- Make no new upstream calls. Don't widen the per-request cache-read budget past what the 0085 lesson allows; cap the day reads.

## Acceptance criteria
- [ ] Unit: Finnhub `symbol=` rejected (429), calendar day cache holds `ZM 2026-11-23 amc` → `next.date` 2026-11-23, `next.session` `amc`, and no "Upcoming date unavailable." warning (a softer "from the calendar" note instead)
- [ ] Unit: nothing cached → unchanged behaviour ("Upcoming date unavailable.")
- [ ] Live: 40 sheets for this week's reporters read 0.3 s apart: none says "Upcoming date unavailable" for a company `/api/calendar` lists in the next 14 days
- [ ] Works at 390×844 and 1440×900

## Test plan
`tests/unit` ticker test with a rejecting `fh` mock and a warmed `MemCache` day.

## Out of scope
Raising Finnhub's limit, and fundamentals/profile fallbacks.
