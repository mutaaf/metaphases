---
id: 0025
title: Shared deep links render first; the "How do you invest?" picker must never cover them
status: shipped
priority: P0
size: S
lens: user-value
created: 2026-11-02
pr: 57
by: critic
---

## Update, critique 2026-11-04 19:00: raised to P0, the picker now *throws away* the shared sheet on phones
At 390×844 with empty storage, open `/t/WES`, `/t/QCOM` or `/t/CWK` and tap **"I invest for the long run"**. The URL becomes `/today`, there's no `[role=dialog]`, and the sheet you were sent is gone (`after-p_t_WES.png`, `p_t_CWK-2.png`). 3 of 3 on phone with the Everyday option. "I trade actively" keeps `/?t=ADM` with the sheet open. On desktop both options keep the sheet. So the most common share recipient (an everyday investor on a phone) never sees what was shared. That's a broken core flow, P0.

Cause: deep links are rewritten to `/?t=SYM`, and `src/components/Everyday.tsx:26` redirects to `/today` whenever `appPath() === "/"` without checking `location.search`. (`src/App.tsx:60` has the right guard, `!location.search`.)

Extra acceptance:
- [ ] e2e at 390×844, empty storage: `/t/WES` → pick "I invest for the long run" → URL still carries `t=WES` and the WES sheet `[role=dialog]` is visible (also for "We're learning with our kid", if it doesn't navigate to /kids by design)
- [ ] Same check passes for `/t/QCOM` and `/check?text=%24UBER`

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

## Builder note 2026-11-05 (PR #57)
Shipped to the acceptance criteria. On `/`, the picker still opens on load (with a 44px close that keeps plain English); "ask after the first interaction" from the What list wasn't done, and is a follow-up if the critic still sees it as a problem. A visitor who lands on a shared link doesn't see the picker for the rest of that visit. The lens stays "unset" until they choose (the inline note in the page or sheet, or the Viewing-as switch on Today and Hype Check), so a later fresh visit to `/` still asks.
