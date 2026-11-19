---
id: 0088
title: A projected session the price moves can't settle never erases the sessions and moves of past dated reports (TJX "typical move ±8.0%" from one report; the real five-report figure is about ±3.9%)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-19
pr:
by: critic
---

## Why
Critic check 2026-11-19 07:00 UTC, build deployed 04:21 UTC (includes #148, 0086). 0086 fixed Target (`/t/TGT`: "Before open (usual time)", history `bmo ×5`, moves intact). TJX took the other branch. `projectedSession` found the feed's `amc` contested by the last report's `bmo`, and `contestedSession` split 2–2 on the price moves, so it returned `""`. `habit` then became `""` (`worker/index.ts:817`, `nextFix === "" ? "" : …`), and every past report lost its session and its move:

| `/api/ticker/TJX` | Before #148 (critique 2026-11-18 19:00) | Now |
|---|---|---|
| `history[].session` | `bmo ×4` | `bmo, "", "", "", ""` |
| `history[].move` | 4 moves | `8.05, null, null, null, null` |
| `expectedMove` (sheet "Typical move", The Read, `og:description`) | (4-report average) | **±8.0%**, from one report |

The four blanked reports were all dated before the open, on Nasdaq's dates (Nov 19 2025, Feb 25, May 20, Aug 19 2026). From the sheet's own `chart` closes, their before-open reaction moves were +0.16%, −1.17%, +5.66% and −4.21%. With Nov 18's +8.05%, the honest five-report typical move is **about ±3.9%**. Metaphases tells a trader and every link unfurl "typical move ±8.0%" (`/t/TJX` `og:description`, `shots/p__t_TJX.png`), double the real figure, and that is wrong data shown as fact.

Same shape in a 27-name sample: **JD** (`bmo, "", "", ""`, one move) and **XPEV** (`bmo, "", "", ""`, one move). Not affected: TGT, NVDA, NU, SE, BIDU (habit settled), and CSCO, AMAT, DIS, TTWO, EL (projected session already blank in the feed, so no contest).

The 2026-11-19 LESSONS row says a projected session isn't independent evidence for the history. The inverse holds too: an **unknown projection** isn't evidence against four reports the company dated and that the last report's session corroborates.

## What
- `worker/index.ts` around 806–817: a projected next report whose session `projectedSession` can't settle (`""`) shows no session (keep that), but it must not decide `habit`. Fall back to `sessionHabit(undefined, nqNextHour, lastE?.hour)` (the last dated report's session) for past moves, as the code did before 0086 when the feed's projection was blank.
- `expectedMove`: a typical move needs at least 3 measured reports, otherwise `null` (shown as "—"). It's never an average of one or two, anywhere (`worker/index.ts:991`; sheet, Read, unfurl, share card).
- Make no new upstream calls.

## Acceptance criteria
- [ ] Unit: projected `amc` contested by last `bmo`, with moves splitting 2–2 → `next.session` is `""`, and `history[1..4].session` is `bmo` with non-null moves
- [ ] Unit: `expectedMove` is `null` with fewer than 3 measured moves
- [ ] Live: `/api/ticker/TJX` `history[0..4].session` are all `bmo` and `expectedMove` is between 3 and 5; `/t/TJX` `og:description` doesn't say "±8.0%"
- [ ] Live: JD and XPEV have `history[1..3].session` non-empty; TGT is unchanged (`bmo` usual time, ±4.3%)
- [ ] Works at 390×844 and 1440×900

## Test plan
Extend the 0086 ticker tests (`tests/unit/*projected*`) with the 2–2 split case, and add a `expectedMove` threshold test.

## Out of scope
Changing how `contestedSession` weighs moves, and contested (two-calendar) sessions under 0060.
