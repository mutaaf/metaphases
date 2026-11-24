---
id: 0108
title: Dell, Autodesk, Deere and Marvell read "time not announced" though their own notices give the time, and Nasdaq times them too
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-24
pr:
by: critic
---

## Why
Company-dated rows (with an `o` link) are the most trustworthy rows on the calendar, yet several arrive with `h: ""`. In that case the UI says "time not announced", which is false. Examples on 2026-11-24 at 07:00 UTC:

| Ticker | Metaphases (`og:title` / sheet) | What the company and Nasdaq say |
|---|---|---|
| DELL | "reports Tue, Nov 24, time not announced (usually after the close)". The sheet itself shows "Earnings call 3:30 p.m. CT, per the company's notice" (`next.call`) | The call is at 3:30 p.m. CT = 4:30 p.m. ET, so after the close. Nasdaq: after hours |
| ADSK | "time not announced (usually after the close)" | Company invitation linked in `o`. Nasdaq: after hours |
| DE | "time not announced (usually before the open)" | Nasdaq: pre-market |
| MRVL | "time not announced (usually after the close)" | Nasdaq: after hours |
| M | "M reports Wed, Dec 2", with no time at all | Nasdaq: pre-market |

- The phone sheet for DELL (`shots/p_light__t_DELL.png`) puts "Time not announced · usually after the close" directly above "Earnings call 3:30 p.m. CT, per the company's notice". The page contradicts itself.
- The day drawer files DELL and ADSK under "Time TBD".
- A trader planning for after-hours tonight is told the time is unknown. A first-time investor sees two statements that disagree.

## What
- Sessions for company-dated rows, in this order: the override's own `h`, then a session derived from `call` (a call that starts 4:00 p.m. ET or later = `amc`; one before 9:30 a.m. ET = `bmo`, converting CT/PT), then Nasdaq's timed session (the 0104 rule), then the `usual` hint.
- Never print "time not announced" when `call` is present or Nasdaq gives a time. Use the 0091 "usually …" copy only when neither exists.
- Fill `h` in `data/date-overrides.json` for DELL, ADSK, DE, MRVL and M where the linked notice states it.

## Acceptance criteria
- [ ] Live: `/api/calendar?from=2026-11-24&to=2026-11-25` has DELL and ADSK with `h: "amc"` and DE with `h: "bmo"`. Their `og:title`s contain no "time not announced".
- [ ] Live: across the next ten days, no row with an `o` link reads `h: ""` while Nasdaq lists a time for that day. Record the count in the PR.
- [ ] Unit: `call: "3:30 p.m. CT"` gives `amc`, `"8:00 a.m. ET"` gives `bmo`, and `"12:00 p.m. ET"` stays as given (never guessed as `dmh`).
- [ ] Works at 390×844 and 1440×900. The DELL sheet shows one consistent time line.

## Test plan
Vitest for the call-time parser and the session precedence. e2e fixture: a company-dated row with `call` and `h: ""` renders "After close" in the drawer, not "Time TBD".

## Out of scope
Fetching notices automatically.
