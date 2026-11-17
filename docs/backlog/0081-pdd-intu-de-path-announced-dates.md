---
id: 0081
title: PDD, Intuit, Deere and UiPath have announced dates the feed gets wrong (Intuit shown Fri Nov 20; it reports Thu Nov 19)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-17
pr:
by: critic
---

## Why
Critic check 2026-11-17 07:00 UTC, build `ec1b5d00`. Four companies have published dates that Metaphases doesn't show:

| Ticker | Metaphases | Company | Source |
|---|---|---|---|
| **INTU** | Fri **Nov 20** after close; the sheet says "Two calendars disagree… treat the date as unconfirmed until the company announces it" | **Thu Nov 19**: Intuit IR events list "First Quarter 2027 Results Conference Call · Nov 19, 2026 · 4:30 PM EST" | [investors.intuit.com](https://investors.intuit.com/) (read 2026-11-17); Nasdaq agrees (Nov 19, after hours) |
| **PDD** | Calendar row on Mon Nov 16 under "Date not confirmed"; `/api/ticker/PDD` → `next: null`, so the sheet has no report at all (`shots/p_PDD.png`) | **Thu Nov 19, before the US open**, call 7:30 a.m. ET (announced Nov 12) | [GlobeNewswire via Quiver](https://www.quiverquant.com/news/PDD+Holdings+to+Report+Third+Quarter+2026+Financial+Results+on+November+19); Nasdaq agrees (pre-market) |
| **DE** | Wed Nov 25, "Time unconfirmed: our data feed lists it after the close; Nasdaq's calendar, before the open" | Wed Nov 25, call **9:00 a.m. CT** (announced Nov 11). The call starts at 10 a.m. ET, after the open, and the release names no release time, so this is a **date-only** override per the overrides `_readme`. Deere has reported before the open in every quarter of Nasdaq's history, and the sheet already says "past moves point to before the open" | [Deere release, wire copy](https://www.placera.se/pressmeddelanden/deere-to-announce-fourth-quarter-2026-financial-results-20261111-1) |
| **PATH** | Next report "Around Tuesday, March 9 (projected)"; a phantom Nov 12 report (0080) | **Thu Dec 3, after the close**, call 5 p.m. ET (announced Nov 5) | [UiPath release](https://investingnews.com/uipath-announces-third-quarter-fiscal-2027-financial-results-conference-call/) |

Intuit is the sharpest: a trader planning around Friday would miss the print by a day, and the sheet tells her the company hasn't announced when it has. Focus item 2: company-published dates override the feed.

## What
- Add overrides to `data/date-overrides.json`: INTU (2026-11-19; set `amc` only if Intuit's release states an after-close release time; the IR page gives just the 4:30 PM ET call, which alone makes it date-only), PDD (2026-11-19, bmo, stated), DE (2026-11-25, date only), PATH (2026-12-03, amc, stated). Use Finnhub's quarter/year labels from the rows (INTU Q1 2027, PDD Q3 2026, DE Q4 2026, PATH: the label Finnhub gives the Dec row, if any).
- If PATH has no Finnhub row for Dec 3 at all, say how the override surfaces (as AXON's did) and that the projected Mar 9 row is no longer "next".
- Sweep the other tracked Nov 18–Dec 4 rows with a Nasdaq disagreement or a blank session (BBY, CPRT, KEYS, ESTC, HPE, ZM, A, J on today's calendar) for a company notice; add each one found; list the rest in the PR.

## Acceptance criteria
- [ ] `/api/ticker/INTU` → `{date: 2026-11-19, confirmed: <Intuit URL>}`, no "Two calendars disagree"; the calendar row sits on Thu Nov 19 in every range that includes it (Nov 16–22, Nov 19 alone, Nov 1–30)
- [ ] `/api/ticker/PDD` → `{2026-11-19, bmo, confirmed}`; the Nov 16 cell no longer lists PDD; the Nov 19 drawer counts it
- [ ] `/api/ticker/DE` → `{2026-11-25, session: "", confirmed}` (or `bmo` only if the release states it)
- [ ] `/api/ticker/PATH` → next `{2026-12-03, amc, confirmed}`
- [ ] Unit: the override table's validator accepts every new row (https source, `checked` within 30 days in New York time)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Override-table unit tests; e2e unchanged (live data).

## Out of scope
The code paths behind PDD's null `next` (0078, reopened) and PATH's phantom report (0080).
