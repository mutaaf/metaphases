---
id: 0087
title: A just-reported company waiting on a second source says so, and the sheet, calendar and unfurl quote one estimate (Target $2.65 vs "$2.05" / "$2.09", Result "—")
status: in-progress
priority: P1
size: S
lens: clarity
created: 2026-11-18
pr:
by: critic
---

## Why
Critic check 2026-11-18 19:00 UTC. Today's big retail reports (TGT, LOW, TJX, all before the open, all verified against their 8-Ks) carry `pr: "n", nA: null` on the calendar, because Nasdaq's `earnings-surprise` hasn't added the quarter yet (it lags about a day: NVDA's Nov 17 row appeared today). By 0058's rule the pair isn't judged, which is honest. But what people see is confusing:

| Where | Target |
|---|---|
| Sheet "Just reported" card (`shots/p__t_TGT.png`) | EPS **$2.65** · Expected **$2.05** · Result **"—"** (no reason given) |
| `/api/calendar` row | `eE 2.05`, `eA 2.65`, `pr: "n"`, `nA: null` |
| Sheet `history[0]` | `epsE: null`, `surprisePct: null` |
| `/t/TGT` unfurl (`og:title`) | "$2.65 a share vs **$2.09** expected" |

A first-time investor sees a 29% gap and a blank verdict, and a different "expected" figure in the shared link. The "—" comes from `src/components/TickerSheet.tsx:36` (`verdict ?? (epsA == null ? "Figures not in yet" : "—")`). TJX's sheet shows the same thing, with `history[0].epsE: null`.

Context the copy could use: Target's $2.65 includes **$0.50** of one-off tariff refunds (8-K). That's why a second source matters before calling it a beat. This ticket doesn't ask to parse 8-Ks.

## What
- When `epsA` is in but the pair isn't judged (`pr: "n"` with `nA` null, or no estimate), Result reads a short reason, e.g. "Not graded yet: waiting for a second source to confirm the figures (usually by the next morning)". Give it a `Term` tooltip. Same treatment for the Today line and the calendar drawer row.
- Use one estimate for a reported row everywhere: the sheet card, `history[0]` and share meta (`tickerShareTitle`, `shared/pending.ts:110`) quote the same `eE` the calendar judges with (`pr` source). Today the unfurl uses Finnhub's $2.09 and the card uses Nasdaq's $2.05.
- Keep the 0058 rule. Don't grade until the same-source pair exists.

## Acceptance criteria
- [ ] Unit: a row with `eA`, `eE`, `pr: "n"`, `nA: null` renders the waiting reason, never a bare "—"
- [ ] Unit/worker: for that row, `og:title`, the sheet card and the calendar row show the same expected figure
- [ ] Live (next print day): a company that reported before the open shows the reason at 390×844 and 1440×900 until Nasdaq's actual lands, then a verdict
- [ ] No new upstream calls

## Test plan
Vitest on the Result label helper and on `tickerShareTitle` with a `pr: "n"` row. Extend the TickerSheet e2e fixture with a just-reported, ungraded row.

## Out of scope
Adjusting EPS for one-off items such as tariff refunds. Changing `shared/grades.ts`.
