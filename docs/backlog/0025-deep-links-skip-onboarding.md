---
id: 0025
title: Shared deep links render first; the "How do you invest?" picker must never cover them
status: ready
priority: P1
size: S
lens: user-value
created: 2026-11-02
pr:
by: critic
---

## Why
Reported in the 2026-11-01 18:58 critique (#5), unticketed, and still live on 2026-11-02. On a fresh 390×844 phone, opening `/check?text=$AXON $UBER to the moon` (the PWA share target, which is exactly how the Everyday investor arrives from Instagram or TikTok) puts a full modal "How do you invest?" over the Hype Check result she was sent (`phone_check_…png`). The same happens on `/`, `/today` and `/t/:sym`. The modal has no visible close button. For the persona in control.json's focus, the first thing a shared link shows is a question about her, not the answer.

## What
- On deep-link routes (`/t/*`, `/check`, `/today`, `/w/*`), don't open the picker. Default to the Everyday lens and show a small inline, dismissible line ("Viewing in plain English · switch to Trader") inside the page instead.
- On `/`, keep the picker only if it has a visible close (×) that defaults to Everyday, and ask after the first interaction rather than on load.
- Esc or the close button dismisses only the picker, never the sheet underneath.

## Acceptance criteria
- [ ] e2e at 390×844 with empty localStorage: `/check?text=%24UBER`, `/t/UBER` and `/today` show no `[role=dialog]` named "How do you invest?" within 3 s, and the Hype Check card or sheet is visible and focusable
- [ ] The lens defaults to Everyday on those routes, and the inline switch changes it and persists
- [ ] On `/` the picker has a visible close button ≥ 40px; closing it leaves the lens on Everyday
- [ ] Esc on a picker opened over a sheet closes the picker only (e2e)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
e2e `onboarding.spec.ts`: fresh context per deep-link route asserts no picker; `/` asserts the close button and default lens.

## Out of scope
Changing what each lens shows.
