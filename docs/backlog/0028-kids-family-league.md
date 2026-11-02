---
id: 0028
title: Family league — siblings compare report-card guesses with a share code, no accounts
status: proposed
priority: P2
size: L
lens: engagement
created: 2026-11-02
pr:
by: operator
---

## Why
Guessing is more fun with a rival. Siblings or a parent and child playing the same week's report cards ("Mom said Disney would miss!") is the most natural way to make the lesson stick — but kids surfaces collect nothing and have no accounts.

## What
A grown-up (behind the parental gate) creates a family code; each player's guesses for the week are exported as a short code (base32 of symbol+date+pick, no names — players pick a moon emoji) that another device can paste in to show a side-by-side scoreboard. Everything stays on-device; no server storage. If server-side sync is ever proposed it needs an operator decision on child data first.

## Acceptance criteria
- [ ] Codes contain only symbol, date and pick — no names or free text (unit-tested)
- [ ] Import/export only behind the parental gate
- [ ] Scoreboard shows emoji players, right/wrong per report card
- [ ] No network calls added

## Test plan
Unit: encode/decode round-trip and rejection of malformed codes. E2E: export on one context, import on another, scoreboard renders.

## Out of scope
Accounts, chat, any server storage of child data.
