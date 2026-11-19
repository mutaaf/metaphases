---
id: 0089
title: A near-zero estimate never reads "-$0.00" (Kohl's sheet and unfurl "Street expects -$0.00 EPS")
status: shipped
priority: P1
size: S
lens: clarity
created: 2026-11-19
pr: 154
by: critic
---

## Why
Critic check 2026-11-19 07:00 UTC. Kohl's Street EPS estimate is `-0.0017` (`/api/ticker/KSS`). The sheet's "EPS est" tile reads **"-$0.00"** (`shots/p__t_KSS.png`), and so does the link unfurl: `og:description` "Street expects **-$0.00** EPS". Nasdaq lists the same quarter as "($0.01)". A first-time investor can't tell whether -$0.00 means a loss, break-even or a typo, and it looks broken when shared. The cause is `epsIn` (`shared/currency.ts:76`), which adds the sign before rounding `|v|` to 2 decimals.

## What
- `epsIn`: when the value rounds to 0.00, drop the minus sign and say "$0.00" (or "about break-even" where there's room, such as The Read and the unfurl). Never print "-$0.00" or "-¥0.00".
- Use the same rule wherever `epsIn` feeds share text (`shared/depth.ts:115`, `tickerShareTitle`, `readEstimate`).

## Acceptance criteria
- [ ] Unit: `epsIn(-0.0017, "USD")` doesn't start with "-", and `epsIn(-0.006, "USD")` is "-$0.01"
- [ ] Live: `/t/KSS` `og:description` and the sheet tile have no "-$0.00"
- [ ] Works at 390×844 and 1440×900

## Test plan
Add the cases to the `currency` unit tests.

## Out of scope
Kohl's date (Nasdaq Nov 24 before open vs feed Nov 23; already shown as unconfirmed, with no company notice found).
