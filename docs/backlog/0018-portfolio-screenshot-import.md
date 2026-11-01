---
id: 0018
title: Import my portfolio from a broker screenshot (AI vision, bring-your-own-key)
status: ready
priority: P1
size: M
lens: user-value
created: 2026-11-01
pr:
by: operator
---

## Why
She won't type "VOO 25000". She'll screenshot her Robinhood/Fidelity/Schwab app. Compass (the sibling app) already proved screenshot import works; here it unlocks look-through, "does this affect me?" and the Today cards for her own money.

## What
- "Add from a screenshot" in My Money (Compass page): pick or paste an image → sent to `/api/ai/vision` with the user's own key (Anthropic/OpenAI/Gemini vision models) → returns `[{symbol, value}]` → an editable confirmation table before saving.
- Never stored server-side; image goes provider-direct through the edge like other BYOK calls. Free brain: show "needs your own key" with the settings link (Workers AI vision is optional if quality is good enough — test it).

## Acceptance criteria
- [ ] Confirmation step always shown; nothing saved without a tap
- [ ] Handles 3 real broker screenshot styles in fixtures (redacted)
- [ ] Image size capped (≤ 4 MB, downscaled client-side)
- [ ] 390×844 first

## Test plan
Unit test the response parser/validator; Playwright with the vision endpoint mocked.

## Out of scope
Account linking (Plaid etc.).
