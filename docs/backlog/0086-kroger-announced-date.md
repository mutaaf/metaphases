---
id: 0086
title: Kroger's sheet says "Wed Dec 2, projected" but the company announced Thu Dec 3, 8 a.m. ET call (Nasdaq agrees)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-18
pr:
by: scout
---

## Why
Scout diff 2026-11-18 (Nasdaq day calendar vs `/api/calendar`, names ≥ $15B, Nov 18 – Dec 4). Everything matched except KR:

| Ticker | Metaphases | Company | Source |
|---|---|---|---|
| **KR** | Wed **Dec 2**, no session, `projected: true`, no `x` flag (`/api/calendar?from=2026-11-30&to=2026-12-06`, `/api/ticker/KR` `next`) | **Thu Dec 3**, call 8:00 a.m. ET (announced Nov 5); Nasdaq: Dec 3, pre-market | [Kroger release via Stockhouse](https://stockhouse.com/news/press-releases/2026/11/05/kroger-announces-third-quarter-conference-call-with-investors); also on ir.kroger.com and PR Newswire |

The company published the date two weeks ago, so this is a company-over-feed override (focus item 2). The calendar carries no Nasdaq flag on KR today (Nasdaq's Dec 3 listing sits outside the 10-weekday cross-check window), so nothing on the page hints that Dec 2 is wrong.

## What
- `data/date-overrides.json`: KR → `2026-12-03`, quarter/year = the feed's labels (Q3 2027), https `source` = the page actually read (the Stockhouse copy; name the PR Newswire/ir.kroger.com release in the `note`), `checked` = today's New York date.
- Session: the notice names only an 8 a.m. ET call. A call that ends before 9:30 ET is a session (precedent: TGT, APD, lesson 2026-11-14), so `hour: "bmo"`. Say that in the `note`.
- Delete the entry 14 days after Dec 3 (Dec 17).

## Acceptance criteria
- [ ] `/api/ticker/KR` → `next` is `{2026-12-03, bmo}`, not projected, with the company source linked
- [ ] The Dec 2 cell no longer lists KR; the Dec 3 drawer does (read in a week range and in a single-day range, lesson 2026-11-18)
- [ ] og:title has no "unconfirmed" or "projected"
- [ ] Estimates (`eE`, `rE`) survive in the narrow range (see 0085; if 0085 is still open, note the limit and don't block on it)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
An override-table unit test like `announced0082Overrides.test.ts`: the gate accepts the entry at the frozen day; through the worker KR leaves Dec 2 and `next.session` is `bmo`. Use a mocked feed that honours `from`/`to` (lesson 2026-11-13). `grep -rn KR tests/unit` first for fixtures that expect the feed's date.

## Out of scope
Canadian banks (RY, TD, CM, BMO, BNS, Dec 2–3 on Nasdaq) are not in the tracked universe; that is a universe decision, not a wrong date. Other late-November names (NTNX, RBRK, CRDO, SYM, BSP) are likewise untracked.
