---
id: 0099
title: A projected feed date leads the headline over Nasdaq's listed day and session (Kohl's and Urban Outfitters read "Monday, November 23 · tomorrow"; every other source says Tuesday)
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-22
pr: 175
by: critic
---

## Why
Critic check 2026-11-22 07:00 UTC. Two retailers are contested on date, and the sheet, unfurl and calendar all lead with the feed's day, which is only a projection:

- `/api/ticker/KSS` → `next: { date: "2026-11-23", session: "", projected: true, nasdaq: { date: "2026-11-24", session: "bmo" } }`. Sheet at 390×844 (`shots/p__t_KSS.png`): "**Monday, November 23** · Time TBD · tomorrow", then "Two calendars disagree. Nasdaq's calendar lists it on Tuesday, November 24, before open." og:title: "KSS reports Mon, Nov 23 (unconfirmed; Nasdaq lists Tue, Nov 24)".
- `/api/ticker/URBN`: the same shape, with Nasdaq on Tue Nov 24 **after close**. og:title "URBN reports Mon, Nov 23 (unconfirmed; …)".
- Other sources: KSS on Nov 24 is listed by Nasdaq (`api.nasdaq.com/api/calendar/earnings?date=2026-11-24`: "pre-market"), Earnings Whispers ("confirmed"), Zacks ([TradingView](https://www.tradingview.com/news/zacks:32c9e20db094b:0-kohl-s-q3-earnings-on-the-horizon-essential-insights-for-investors/)) and Public.com. URBN on Nov 24 is listed by Nasdaq (after close) and [MarketBeat](https://www.marketbeat.com/stocks/NASDAQ/URBN/earnings/) (5 p.m. ET call); last year URBN reported Nov 25 after the close. **No source but Finnhub says Monday**, and Finnhub's own row is flagged `projected`.

The disagreement copy is honest, so this isn't wrong data. But the headline is the first thing a trader reads and it says "tomorrow". The second calendar has a named session while the feed has none and calls its own date a projection. 0062 settled contested *sessions* this way; 0078 kept a contested projected *day* from turning into "results pending". This is the remaining case: which day leads the headline while both are unconfirmed.

## What
- In the sheet's `next` (`worker/index.ts`, the `contested` headline near line 1622), the share title (`ogTitle`) and the calendar row, when **all** of these hold:
  - the feed's next row is projected (`isProjected`, no company source `o`/`confirmed`),
  - the cross-check lists **another date** with a session (`next.nasdaq.date ≠ next.date`, `session` is `bmo`/`amc`),
  - the feed's row has no session (`""`),

  then lead with Nasdaq's day and session, still marked unconfirmed: "Tuesday, November 24 · before open (unconfirmed) · Our data feed projects Monday, November 23."
- Place the calendar row on Nasdaq's day for that case, keeping the existing `x: "differs"` / `xd` evidence the other way round (`xd` = the feed's day), so the "Date not confirmed" count still holds.
- Change nothing when the feed row has a session of its own, when the company has announced a date (overrides win), or when Nasdaq has no session.

## Acceptance criteria
- [x] Unit: a KSS-shaped `next` (feed Nov 23 `""` projected; Nasdaq Nov 24 `bmo`) headlines Nov 24 before open and names Nov 23 as the feed's projection. The same row with a feed session `amc`, or with a company source, keeps the feed's day.
- [x] `ogTitle` for that sheet leads with "Tue, Nov 24" and still says "unconfirmed".
- [x] The day drawer for the Nasdaq day lists the row under "Date not confirmed", and the feed's day no longer counts it.
- [x] e2e on fixtures at 390×844 and 1440×900: the sheet's headline reads the Nasdaq day, and the "Two calendars disagree" line names the feed's day.
- [x] Loading / empty / error / partial states handled: with a cold cross-check (no `nasdaq`), the sheet shows today's behaviour.

## Test plan
Vitest on the contested-headline helper (`shared/contestedTime.ts` or wherever `contested` is built) and `ogTitle` (`shared/pending.ts`) with the three cases above. Extend the contested-date e2e fixture spec.

## Out of scope
Deciding the date when both calendars name a session (needs the company). Adding more calendar sources (new runtime hosts are not allowed).
