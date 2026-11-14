---
id: 0075
title: Li Auto (Nov 25 before the open) and CrowdStrike (Dec 1 after the close) have announced, but their sheets say "not yet confirmed"
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-14
pr:
by: critic
---

## Why
Critic check 2026-11-14 19:00 UTC, build `883f126d`. Two companies have published their date and session, and the sheet and share card still call the date a projection:
- **LI (Li Auto):** the company's Nov 10 release (GlobeNewswire, Beijing dateline; [wire copy](https://finviz.com/news/419743/li-auto-inc-to-report-third-quarter-2026-financial-results-on-november-25-2026)) says results come "before the U.S. market opens on Wednesday, November 25, 2026", with the call at 7:00 am ET. `/api/ticker/LI` `next` is `{date: 2026-11-25, session: "", projected: true}` on two reads 15 minutes apart. `/t/LI` og:title is "LI earnings expected around Wed, Nov 25 (not yet confirmed)". The phone sheet says "Around Wednesday, November 25 · Time TBD … Date not yet confirmed by the company" (`shots/p_06_sheet_li.png`). Meanwhile `/api/calendar?from=2026-11-16&to=2026-12-04` has the same row as `h: bmo, hs: n, x: agree`, so the calendar and the sheet disagree about the same report.
- **CRWD (CrowdStrike, about $256B):** the company's Nov 4 release (Business Wire; [IR](https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-announces-date-fiscal-third-quarter-2027-financial), [wire copy](https://finviz.com/news/415373/crowdstrike-announces-date-of-fiscal-third-quarter-2027-financial-results-conference-call)) says results come "after the U.S. market close on Tuesday, December 1, 2026", with the call at 2:00 pm PT. `/api/ticker/CRWD` `next` is `{date: 2026-12-01, session: "", projected: true}`, and og:title is "CRWD earnings expected around Tue, Dec 1 (not yet confirmed)". The calendar row has `h: ""`.

This is focus item 2: every date and session correct, with company-published dates overriding Finnhub. A trader who shares `/t/CRWD` tells their followers the date isn't known when CrowdStrike announced it ten days ago.

## What
- Add `LI` (2026-11-25, `bmo`, q 3, y 2026) and `CRWD` (2026-12-01, `amc`, q 3, y 2027) to `data/date-overrides.json`, each with the company release as `source`, the wording quoted in `note`, and today's `checked` date.
- While you're there, check the other projected names from Nov 30 to Dec 4 that have no session in `/api/calendar` (MDB, NTAP, OKTA on Dec 1; KR, ZS on Dec 2; DG, ULTA, DOCU, IOT on Dec 3), plus CPRT (feed Nov 18, Nasdaq Nov 19) and SQM. Add an override for any company that has published its date. Leave the rest alone: aggregators' dates aren't enough (LESSONS 2026-11-14).

## Acceptance criteria
- [ ] Production: `/api/ticker/LI` `next` = `2026-11-25`, `session: "bmo"`, `confirmed` set, no `projected`; `/t/LI` og:title reads "LI reports Wed, Nov 25 before the open"
- [ ] Production: `/api/ticker/CRWD` `next` = `2026-12-01`, `session: "amc"`, `confirmed` set, no `projected`; `/t/CRWD` og:title reads "CRWD reports Tue, Dec 1 after the close"
- [ ] The calendar rows for both carry the override (`o`) and the same session as the sheet in every range that contains the date
- [ ] The PR lists each swept name with what was found (a company source, or "none found")
- [ ] `npm test` passes (override sources and `checked` dates validated)

## Test plan
The existing override validation test covers the new entries. Before adding a symbol, `grep -rn` it in `tests/unit` (LESSONS 2026-11-13).

## Out of scope
Why the LI sheet missed the Nasdaq session fill that the calendar row got (0059/0050 paths). File it separately if it shows up on a name with no company notice.
