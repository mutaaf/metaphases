---
id: 0105
title: Gaotu shows "around Tue Nov 24, not yet confirmed" a week after the company announced Wed Nov 25 before the open; projected rows don't show Nasdaq's other day
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-23
pr: 189
by: critic
---

## Why
On 2026-11-16, Gaotu Techedu (GOTU) announced that it reports Q3 2026 **before U.S. markets open on Wednesday, November 25, 2026**, with the call at 8:00 a.m. ET ([company notice via Finviz](https://finviz.com/news/422913/gaotu-techedu-to-report-third-quarter-2026-financial-results-on-november-25-2026), also on [TechNode Global](https://technode.global/?p=997811)). Nasdaq's Nov 25 calendar lists GOTU pre-market.

Metaphases at 19:00 UTC on Nov 23 shows something else:
- `/api/calendar?from=2026-11-23&to=2026-11-25`: `{s: GOTU, d: 2026-11-24, h: "", t: 0, x: "unknown"}`. The row is on the wrong day, with no session and no "Nasdaq lists Nov 25" note.
- `/t/GOTU` at 390×844 reads "Around Tuesday, November 24 · Time TBD · tomorrow · Date not yet confirmed by the company" (`shots/p_light__t_GOTU.png` in the 19:00 critique). The company *has* confirmed it, for another day.
- The share unfurl (`og:title`) reads "GOTU earnings expected around Tue, Nov 24 (not yet confirmed)".

Anyone who sets a reminder from this gets it a day early, and the "not confirmed" hedge is false. GOTU is off-universe (not in `data/universe.json`), so it never gets a `date-overrides.json` entry or the 0099 Nasdaq-day treatment. It is a foreign filer, which focus item (2) names. In the same sweep of 66 symbols over Nov 23 – Dec 4 that Nasdaq lists, GOTU and CHA are the only day mismatches. CHA (Thanksgiving Nov 26 vs Nasdaq Nov 27) has no company notice yet, so it isn't filed.

## What
- Immediate: add GOTU to `data/date-overrides.json` (2026-11-25, `bmo`, the company's notice) if overrides can apply to off-universe symbols. If they can't, make them.
- Rule: when a projected row (`t: 0`) sits on a day Nasdaq doesn't list it for, and Nasdaq lists the same symbol within ±3 trading days, show the 0059/0099 contested-day state ("Nasdaq lists Wed Nov 25, before open") on the calendar, sheet and unfurl, instead of `x: "unknown"`. This must work for off-universe symbols too.

## Acceptance criteria
- [ ] Live before Nov 24: `/api/calendar?from=2026-11-23&to=2026-11-27` has exactly one GOTU row, on 2026-11-25 with `h: "bmo"` and the company's link (`o`), or at minimum a contested-day marker naming Nov 25.
- [ ] `/t/GOTU` and its `og:title` never say "not yet confirmed" for a date other than the company's.
- [ ] Unit: a projected off-universe row whose day Nasdaq contradicts (Nasdaq one day later, timed) is flagged, and the same row with Nasdaq agreeing isn't.
- [ ] Works at 390×844 and 1440×900. With Nasdaq unavailable, the row is unchanged (no guessing).

## Test plan
Vitest beside the 0099 tests (Nasdaq day leads), plus the date-overrides validator test for the new entry.

## Out of scope
Finding company notices automatically.

## Builder notes (2026-11-24)
- **Company date:** `data/date-overrides.json` → GOTU Wed Nov 25, `bmo`, call 8 a.m. ET, from the Nov 16 PR Newswire release (wire copy read in full). Overrides already apply to off-universe rows (`applyToEvents` matches any symbol the feed returns), so the calendar, `/t/GOTU` and its unfurl all read the company's date.
- **Why the 0099 lead missed it:** the slim Nasdaq day cache keeps tracked names and $1B+ companies only (`keepNq`). The calendar shows untracked companies by *revenue* in the feed's currency (CN¥1.9B for GOTU), so a $490M ADR was on the calendar while its Nasdaq listing was thrown away. `keepNasdaq` now also keeps *timed* listings from $250M (a timeless one can't lead). Thanksgiving week's Nov 25: 6 rows ≥ $1B, 10 kept with the new rule, out of 45, so the cache barely grows.
- **Not changed:** an untracked small company Nasdaq lists *without* a time is still dropped, and if the whole window loaded it can read `x: "unknown"`. Nothing in the UI reads `unknown` today (only `differs` drives copy), so it's left as is rather than rewrite 0015's contract in a P0.
