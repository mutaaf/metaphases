---
id: 0084
title: Bath & Body Works and Helmerich & Payne have announced dates the feed gets wrong (HP's sheet says "Thu Nov 19 · After close"; its call is 10 a.m. that morning)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-18
pr:
by: critic
---

## Why
Critic check 2026-11-18 06:50 UTC. Two Nov 18–19 reporters are contested by Nasdaq, and the company has published a date for both:

| Ticker | Metaphases | Company | Source |
|---|---|---|---|
| **BBWI** | Wed **Nov 18**, no session, "Date not confirmed · Our data feed put it on Wednesday, November 18… Nasdaq's calendar lists it on Thursday, November 19, before open" (`shots/p_t_BBWI.png`) | **Thu Nov 19, before the market opens**; call 8:30 a.m. ET (announced Nov 5) | [GlobeNewswire via Morningstar](https://www.morningstar.com/news/globe-newswire/9870331/bath-body-works-to-report-third-quarter-results-on-november-19-2026); Nasdaq: Nov 19, pre-market |
| **HP** | Headline **"Thursday, November 19 · After close · tomorrow"**, with "Two calendars disagree. Nasdaq's calendar lists it on Wednesday, November 18, after close. Treat the date as unconfirmed until the company announces it" (`shots/p_t_HP.png`) | Fiscal Q4 2026 call **10 a.m. ET (9 a.m. CT), Thursday, November 19** (announced Oct 14). The notice gives no release time | [Helmerich & Payne release (PDF)](https://s25.q4cdn.com/694655835/files/doc_news/Helmerich--Payne-Inc--Schedules-Fiscal-Fourth-Quarter-2026-and-Year-End-Conference-Call-and-Webcast-2026.pdf); Nasdaq: Nov 18, after hours |

HP's "after close on Thursday" is impossible, because the company is on the phone discussing the results at 10 a.m. that day. The sheet also tells the reader to wait "until the company announces it", but the company announced it five weeks ago. Focus item 2: company-published dates override the feed.

## What
- `data/date-overrides.json`: BBWI → 2026-11-19, `hour: "bmo"` (stated "before market open"), Q3 2026 per the feed's labels.
- HP → the company names only the call (Thu 10 a.m. ET). Follow the INTU/DE precedent: a call time alone isn't a session, so date `2026-11-19` with no `hour`, and a note that the release usually lands the evening before (FY25: released Nov 17 after the close, call Nov 18) and that Nasdaq says Nov 18 after hours. If a company release that states the release time turns up (hpinc.com), use that instead.
- Check that BBWI leaves Nov 18 (no figure-less leftover on the 18th once it passes) and that HP no longer reads "After close" on the 19th.

## Acceptance criteria
- [ ] `/api/ticker/BBWI` → next `{2026-11-19, bmo, confirmed: <company URL>}`; the Nov 18 cell doesn't list BBWI; the Nov 19 drawer does
- [ ] `/api/ticker/HP` → next has no `amc` on 2026-11-19 (date-only Nov 19 confirmed, or a company-stated release time); the sheet never says "After close" for Thursday
- [ ] og:title for both has no "unconfirmed" and no "results expected"
- [ ] Unit: the override validator accepts both rows (https source, `checked` in New York time)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
An override-table unit test like `announced0082Overrides.test.ts`: the gate accepts both, and through the worker BBWI leaves Nov 18 and HP's `next.session` is not `amc`.

## Out of scope
VIPS (feed Nov 18, Nasdaq Nov 24, no company notice found on 2026-11-18; it's shown honestly as contested). The estimate loss in 0085.
