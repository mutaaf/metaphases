---
id: 0060
title: A contested session never sets the typical move (Deere ±1.6% shown, ±7.9% real; ADI ±1.7% vs ±3.2%), and ADI's announced 7:00 am release is used
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-12
pr:
by: critic
---

## Why
Critic check 2026-11-12 07:00 UTC, build `a29c8878`. When Finnhub and Nasdaq list the **same date in different sessions** (`x: differs`, `xd` = the row's own date), the sheet says the time is unconfirmed but still measures every past reaction with Finnhub's session (`sessionHabit` in `shared/reaction.ts:21` takes `nextHour` first; `worker/index.ts:549`). When Finnhub is wrong, the typical move, each history row's move and the og description are all measured on the day *after* the reaction. Those are the numbers a trader sizes a position on.

Closes from each sheet's own `chart` series (`/api/ticker/SYM`), last four reports:

| Ticker | Finnhub / Nasdaq | Company | Shown moves (session used) | Moves measured the other way | Typical move shown → true |
|---|---|---|---|---|---|
| ADI Nov 24 | amc / **bmo** | **"7:00 a.m. Eastern time on Tuesday, November 24"** ([ADI, Oct 22](https://www.analog.com/en/newsroom/press-releases/2026/10-22-2026-adi-report-4q-fy2026-financial-results.html)) | −0.8, −3.5, −0.3, +2.3 | −0.9, −3.9, **+2.6, +5.3** | **±1.7% → ±3.2%** |
| DE Nov 25 | amc / **bmo** | Q3 released Aug 20 at 6:20 am ET ([Earnings Whispers](https://earningswhispers.com/article/DE/2608208493)); Q4 last year on the Wednesday morning before Thanksgiving | +4.3, −0.4, +0.1 | +6.9, −5.2, **+11.6** | **±1.6% → ±7.9%** |
| ROAD Nov 19 | amc / **bmo** | — | −1.3, −3.6, −0.5, +0.7 | **+19.6**, +6.9, +11.2, −3.6 | **±1.5% → ±10.3%** |
| WMG Nov 19 | **amc** / bmo | — | +1.7, +7.5, +3.1, +3.4 | +0.8, +2.3, 0.0, −2.7 | ±3.9% (Finnhub right here) |

So neither feed can simply win: Nasdaq is right for ADI, DE and ROAD and wrong for WMG. The price series already on the sheet tells which day the market reacted on: for ADI, DE and ROAD the "other" day is the bigger move in 3–4 of 4 quarters, and for WMG it's the reverse.

The sheet also undercuts itself on ADI. It says "Two calendars disagree … Treat the date as unconfirmed until the company announces it" (`shots/p__t_ADI.png`), yet ADI announced the date *and* the 7:00 am time on Oct 22, three weeks ago. og:description: "report time unconfirmed … typical move ±1.7%", which states the wrong number as fact next to an admission that it doesn't know the session. Medtronic (Nov 24, 5:45 am CT, [Medtronic, Oct 30](https://news.medtronic.com/2026-11-04-Medtronic-to-announce-financial-results-for-its-second-quarter-of-fiscal-year-2027)) is right only because both feeds happen to agree.

## What
- Add ADI to `data/date-overrides.json`: `2026-11-24`, `bmo`, the release as `source`, checked today. Search for a company notice for DE too (none found today); don't invent one.
- When the next report's session is contested (Finnhub and Nasdaq both give a session for the same date and they differ) and no company override decides it, don't measure past moves with either feed's session blindly. Either:
  - (a) pick the session whose reaction day carries the larger absolute close-to-close move in at least 3 of the last 4 reports (from the sheet's own `chart` closes, no new calls), and say on the sheet that the session is inferred from how the stock moved; or
  - (b) leave every move and the typical move "—" with a one-line reason ("the two calendars disagree on the time, so we can't tell which day the market reacted").
  Either way, never print a typical move measured on one feed's contested session as fact, on the sheet, in The Read or in og:description.
- The same rule applies wherever `sessionHabit` feeds a move (`kidsWhy`, `worker/index.ts:1010`).
- Copy: on a row with a company override, the 0015 "two calendars disagree" note never appears (ADI after the override).

## Acceptance criteria
- [ ] `/api/ticker/ADI`: `next.session === "bmo"` from the override; no `next.nasdaq`; `history[0..3].move` ≈ −0.9, −3.9, +2.6, +5.3 (±0.1); `expectedMove` ≈ 3.2 (±0.2); the sheet has no "Two calendars disagree" note
- [ ] `/api/ticker/DE` and `/api/ticker/ROAD` (contested, no override): `expectedMove` is either null with a stated reason, or, under (a), ≈ 7.9 and ≈ 10.3 with the inferred-session note. Never 1.6 or 1.5.
- [ ] `/api/ticker/WMG` under (a) keeps amc and ±3.9%; under (b) it shows "—"
- [ ] `/t/DE` og:description doesn't state a typical move measured on a contested session
- [ ] Unit test (made-up symbol): Finnhub `amc`, Nasdaq `bmo` on the same date, closes where the report-day move is 4× the next-day move in 3 of 4 quarters → the moves are taken on the report day (a), or null (b)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest on the session-resolution rule (the four cases above with made-up symbols and closes) and on `validateOverrides` for the ADI entry only (LESSONS 2026-11-10: gate only this ticket's override). Reproduce on production:

```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
for s in ADI DE ROAD WMG; do curl -s -A "$UA" "$B/api/ticker/$s" | python3 -c "
import sys,json,datetime;d=json.load(sys.stdin);c=d['chart'];cl=c['c']
i_={str(datetime.datetime.utcfromtimestamp(x).date()):i for i,x in enumerate(c['t'])}
print('$s',d['next']['session'],d['next'].get('nasdaq'),round(d['expectedMove'] or 0,2))
for h in d['history'][:4]:
  i=i_.get(h['date']);print(' ',h['date'],h['session'],h['move'],'bmo',(cl[i]-cl[i-1])/cl[i-1]*100,'amc',(cl[i+1]-cl[i])/cl[i]*100)"; sleep 4; done
```

## Out of scope
Changing which feed wins the *date* (0015 and 0059 already flag it). Revenue basis. Sessions both feeds agree on.
