---
id: 0019
title: "Explain like I'm new" on every number and term
status: ready
priority: P2
size: M
lens: clarity
created: 2026-11-01
pr:
by: operator
---

## Why
The glossary covers terms, but she meets numbers in context: "±4.8%", "B+", "EPS $2.53". One tap should explain *that* number for *that* company in a sentence, without opening a chat.

## What
- A small "?" affordance next to key numbers in the ticker sheet, Today cards and Hype Check cards (Everyday lens only) that opens a popover: first the deterministic explanation (from `shared/plain.ts` + glossary), then optionally "Explain more" → free-brain AI with the number and its context.
- Cache AI explanations per symbol+field per day in localStorage.

## Acceptance criteria
- [ ] Deterministic text appears instantly with no network
- [ ] AI only on explicit tap
- [ ] Keyboard and screen-reader accessible; works at 390×844

## Test plan
Unit tests for the deterministic explanations; Playwright for the popover.

## Out of scope
Changing the Trader lens.
