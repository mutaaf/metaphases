---
id: 0015
title: Cross-check upcoming report dates against Nasdaq's per-day calendar and flag disagreements
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr: 75
by: scout
---

## Evidence 2026-11-04 07:00 UTC (critic)
The universe-vs-Nasdaq day conflicts fell from 9 to 2 (ECHO: Nasdaq Nov 5, us Nov 11; SBET: Nasdaq Nov 9, us Nov 10), because the 0013 overrides took the other five. The past-row conflicts that 0038 lists (WES, TECH, CWK, HUBG, PAA, UI) are exactly what this cross-check would catch. **CSCO** (outside the universe sweep window because our date is later): Nasdaq **Nov 11**, Finnhub Nov 18 with a blank session. Cisco's last two Q1s were Wed Nov 12, 2025 and Wed Nov 13, 2024, after the close, so Nov 18 is likely a projection. Nasdaq's EPS forecast is $1.15 against our $1.35. Not verified against the company (no release found yet).

## Evidence 2026-11-03 07:00 UTC (critic)
For tracked names, Nov 3–12: 8 day conflicts with Nasdaq's per-day calendar (FIS, TECH, APD, ARM, STE, SBET, ECHO, MARA) and 12 names Nasdaq lists that our calendar lacks (AES, TM, NVO, NWS, HUT, SONY, AXON, BRK.B, HMC, CSCO, TDG, JD). In the 5 conflicts checked against a company release (FIS, APD, STE, ARM, AXON), **Nasdaq matched the company 5/5 and Finnhub 0/5**. Suggestion for the operator (the critic doesn't decide this): when Finnhub's session is blank and Nasdaq gives a session, prefer Nasdaq's day and keep the "unconfirmed" note. At minimum, the `differs` note must name Nasdaq's date, not just say "disagree".

## Shipped 2026-11-09 (builder, PR #75)
`shared/crossCheck.ts` compares the next 14 days (and Finnhub dates up to a month past them that Nasdaq lists sooner) with Nasdaq's per-day calendar: `x: agree | differs | unknown`, `xd`/`xh` name Nasdaq's day and session, and a blank session is filled only on agreement. Company-dated (`o`) and closed-day (`c`) rows are skipped. The sheet reads the folded window from the cache only (`next.nasdaq`). One deliberate deviation: a Nasdaq failure is **not** a `warnings` entry, because warnings make the client show "busy" and retry (0047). It's counted in `unchecked` instead and leaves the events as Finnhub has them. Live dry run on 2026-11-09 for Nov 9–20: 95 agree, 13 differ (PDD, WSM, ROST, CPRT, HP…), 17 not listed.

## Why
Finnhub dates with a blank session are often projections (AXON Nov 2 vs company Nov 5; ARM Nov 5 vs Nov 4). Scout spot-check 2026-11-01: CEG shows Mon Nov 9 with no session, while a calendar listing (AJ Bell) shows its Q3 call on Nov 6 at 10:00 ET and Constellation held its Q3 2025 call on a Friday in the same week; no company release was found, so the date is unconfirmed either way. WBD (Nov 4 bmo) is also unconfirmed by any company release. Tickets 0007 and 0013 label and hand-correct dates; neither detects them. `api.nasdaq.com` is already an allowed host and also serves a per-day earnings calendar with the session (`/api/calendar/earnings?date=YYYY-MM-DD`).

## What
- In the worker, for the next 14 days, fetch Nasdaq's per-day calendar via `pool()` (cached 6h with `cached()`), and compare each Finnhub event: `agree`, `differs` (Nasdaq lists the company on another day or session) or `unknown` (Nasdaq doesn't list it).
- Add `x?: "agree"|"differs"|"unknown"` to calendar events (`shared/types.ts`). On `differs`, the sheet and day drawer say "Finnhub and Nasdaq disagree on this date, so treat it as unconfirmed". Never silently replace either date. On `agree` with a session, fill a missing `h`.
- A Nasdaq failure adds a `warnings` entry and leaves events unchanged.
- Files: `worker/index.ts`, `shared/types.ts`, `src/components/TickerSheet.tsx`, `src/components/Calendar.tsx`, `src/lib/glossary.ts`.

## Acceptance criteria
- [ ] A fixture company whose Nasdaq day differs shows the disagreement note in the sheet and day drawer; an agreeing one shows nothing extra
- [ ] A blank `h` is filled from Nasdaq only when both sources agree on the day
- [ ] Nasdaq 429/timeout leaves the calendar intact with a warning, and added calls stay within the pool cap (≤ 6 concurrent)
- [ ] Worker stays clear of the 1102 resource limit (see 0012); at most 14 extra cached subrequests per 6h
- [ ] Works at 390×844 touch and 1440×900, no horizontal scroll
- [ ] Loading / empty / error / partial states handled

## Test plan
Unit: comparison function over agree/differs/unknown/fill cases using a recorded Nasdaq per-day fixture. e2e (fixtures): a differing event shows the note at both viewports.

## Out of scope
Replacing dates with Nasdaq's. Company overrides stay in 0013. No new hosts.
