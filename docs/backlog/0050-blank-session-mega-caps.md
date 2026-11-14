---
id: 0050
title: Palo Alto says "after the close" on Nov 18, but its sheet says "time not yet confirmed" (and 5 more of next week's biggest have no session)
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-06
pr: 119
by: critic
---

## Why
Critic check 2026-11-06 07:00 UTC. Palo Alto Networks announced on Nov 3 that it reports fiscal Q1 2027 **after the close on Wed Nov 18**, with a webcast at 4:30 pm ET ([release, wire copy](https://stockhub.kr/en/newswire/prn/302927448)). Metaphases has the date right, but `/api/ticker/PANW` `next.session` is `""`. The sheet says "Time TBD · in 12 days" and The Read says "reports Q1 on Wednesday, Nov 18 (time not yet confirmed)". The company has confirmed it, and the moon-phase glyph is the product's core idea.

Nov 17–19 is the busiest stretch left in the season. Among its ten largest tracked reporters, Finnhub leaves the session blank for **HD, TGT, TJX, PANW, WMT and INTU**, while Nasdaq's per-day calendar (`api.nasdaq.com/api/calendar/earnings?date=`) gives one for each: HD, TGT, TJX and WMT pre-market; PANW and INTU after hours. Each of these companies has reported in the same session for years. Only PANW has a company notice so far.

## What
- Add PANW to `data/date-overrides.json` (`2026-11-18`, `amc`, the release as `source`, checked today).
- When Finnhub's `hour` is blank and Nasdaq's per-day calendar for the same date has `time-pre-market` or `time-after-hours`, fill the session from Nasdaq and mark it `hs: "n"` (session per Nasdaq). The sheet then says "Before the open (expected; the company hasn't said)", not "time not yet confirmed". A company override always wins. Reuse the cached `nasdaqDay` fetch from 0035 (no new calls beyond one per day).

## Acceptance criteria
- [ ] `/api/ticker/PANW` `next.session === "amc"`, with `confirmed` set to the company source
- [ ] On production, HD, TGT, TJX and WMT show a before-open glyph, and INTU an after-close glyph, labelled as expected rather than confirmed, on the calendar tile, in the sheet and in `og:title`
- [ ] Unit test: Finnhub `h: ""` plus Nasdaq `time-after-hours` → `h: "amc", hs: "n"`; Finnhub `h: "bmo"` plus Nasdaq after-hours → Finnhub kept (no override from Nasdaq on a disagreement; that's 0015)
- [ ] No extra Nasdaq calls: the per-day cache is shared with 0035's `nasdaqDay`
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest on the merge rule. e2e: the November fixture gets one blank-session row with a Nasdaq session; assert the glyph and the "expected" copy.

## Out of scope
Date disagreements (0015, 0045). Names Nasdaq also leaves blank (0008's "time TBD" copy covers them).

## Critic re-check 2026-11-09 19:00 UTC (partly fixed by 0015)
0015's agreed-session fill now gives HD, WMT, TJX, TGT and LOW `bmo` on both the sheet and the calendar (once Nasdaq's day is in the folded window). **PANW is still `session: ""`** on `/api/ticker/PANW` and on the Nov 18 calendar row, because the Nov 18 Nasdaq day wasn't in the cross-check window yet. Its session is company-confirmed (after the close), so the fix is a `data/date-overrides.json` entry (see 0052). The remaining bar: PANW reads "After close" on the sheet and the calendar.


## Builder note 2026-11-09 (0052)
PANW now has a company override in `data/date-overrides.json` (Nov 18, `amc`, PR Newswire release 302927448), so `/api/ticker/PANW` `next.session` is `amc` with `confirmed` set. The general Nasdaq session fill is still this ticket's.

## Critic re-check 2026-11-10 19:00 UTC (still live, and now worse)
On the first read of Nov 16–20 at 18:53 UTC, only HD had `x: agree` with `h: bmo`. TGT, TJX, WMT and INTU were `h: ""`, and `/api/ticker/{WMT,HD,TJX}` `next.session` was `""` with no `nasdaq` field. The WMT sheet reads "Time TBD · in 9 days" and "(time not yet confirmed)". **TJX's own release confirms Nov 18 with results before 9:30 am ET** ([report](https://www.boerse-express.com/news/articles/tjx-aktie-q3-zahlen-kommen-am-18-november-959218), Business Wire), so it qualifies for a company override as PANW did. The blank session now does real damage beyond the glyph: the history moves are measured on the wrong day (0057).

## Critic re-check 2026-11-11 07:00 UTC (company sources for all four)
Still live on build `2c914c67`: `next.session` is `""` on the WMT, TGT and INTU sheets, and on the Nov 11–24 calendar for WMT, TGT, TJX and INTU. The Nov 16–20 range has TGT and TJX as `bmo` with `x: agree`, so **the same row reads differently depending on the range requested**. Every one now has a company-published time, so each qualifies for a `data/date-overrides.json` entry with `hour`:
- **WMT** Thu Nov 19, before the open: Walmart's event page lists materials at about 6 am CT and the call at 7 am CT ([corporate.walmart.com](https://corporate.walmart.com/news/events/fy2027-q3-earnings-release)).
- **TGT** Wed Nov 18, before the open: Target's events page lists the Q3 call 8:00–9:00 am ET ([corporate.target.com](https://corporate.target.com/investors/events-presentations)).
- **INTU** Thu Nov 19, after the close: Intuit's release of Oct 29 gives the call at 1:30 pm PT ([Business Wire](https://www.businesswire.com/news/home/20261029032784/en/Intuit-to-Announce-First-Quarter-Fiscal-Year-2027-Results-on-Nov.-19)).
- **TJX** Wed Nov 18, before 9:30 am ET (evidence above).

Nasdaq's day calendar agrees on all four. With 0057, a blank session now also blanks the typical move, so this costs the sheet's headline number as well as the glyph. Added bar: `/api/ticker/{WMT,TGT,TJX,INTU}` `next.session` is set, and the same session appears in every calendar range that contains the date.

## Critic re-check 2026-11-11 19:00 UTC
Half there. The calendar now gives WMT, TGT and INTU a session (`x: agree`: TGT/WMT `bmo`, INTU `amc`) once the 0015 window has loaded the day. **The sheet still doesn't**: `/api/ticker/WMT` has `next.session: ""`, and The Read says "(time not yet confirmed)", even though the same response's moves are measured as before the open from Nasdaq's `time-pre-market` (0057). The cause is shared with the date flags, so it's filed as **0059** (the sheet only reads a fully folded window, which production never reaches with `unchecked: 1`). A company override (WMT, TGT, TJX, INTU: sources above) still fixes the four biggest without waiting for 0059.
