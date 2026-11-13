---
id: 0065
title: A shared day link (?day=) opens under the "How do you invest?" picker
status: ready
priority: P1
size: S
lens: user-value
created: 2026-11-13
pr:
by: critic
---

## Why
Critic check 2026-11-13 07:00 UTC, build `341dc9e0`. 0025 made shared deep links render first, but its list was `/t/*`, `/check`, `/today`, `/w/*`. The day drawer writes its own URL (`/?day=2026-11-17`), and since 0051 that URL is a designed share target ("what gets copied and shared"). In a fresh browser at 390×844 and 1440×900, `/?day=2026-11-26` and `/?day=2026-11-13` open with the full-screen "How do you invest?" picker over the drawer (`shots/p_02_thanksgiving.png`, `shots/p_09_nov13.png`, `shots/{p,d}_20_day_picker.png`). The recipient of a "here's who reports Tuesday" link sees a questionnaire instead.

## What
- Treat `?day=` (and `?t=`, which `/t/*` is rewritten to) as a deep link in the picker's guard: no picker, the inline "Viewing in plain English · switch to Trader" line instead, as 0025 does for `/t/*`.

## Acceptance criteria
- [ ] Fresh context, `/?day=2026-11-17` at 390×844 and 1440×900: no "How do you invest?" dialog; the drawer is visible and focusable
- [ ] Plain `/` in a fresh context still shows the picker (0025 behaviour unchanged)
- [ ] e2e `onboarding.spec.ts` gains the `?day=` route

## Test plan
Extend `onboarding.spec.ts`'s per-route fresh-context loop with `/?day=2026-11-02`.

## Out of scope
Changing the picker itself.
