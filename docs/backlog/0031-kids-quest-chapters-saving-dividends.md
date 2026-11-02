---
id: 0031
title: Kids quest chapters 2 and 3 — Save or Grow? (saving vs investing) and Your Slice Pays You (dividends)
status: in-progress
priority: P1
size: M
lens: user-value
created: 2026-11-02
pr:
by: operator
---

## Why
The operator: "add the saving vs investing and dividends chapters and make things extremely detailed and broken down like micro lessons". After the Lemonade Stand a kid knows what a company, a share and a price are, but not why you'd keep money safe versus let it grow, or how owning a share can pay you.

## What
- `/kids/start` is now multi-chapter. A new kid still goes straight into Chapter 1; after it, a chapter picker shows all three with "up next". Each chapter has a chapter nav and its own step strip. URLs: `/kids/start?chapter=save&step=jar`; old `?step=company` links still work.
- **Chapter 2 — Save or Grow?** Four micro-lessons:
  1. Savings jar: tap through 5 years at 2% interest. It's safe and never goes down.
  2. Money tree: 10 years on a fixed bumpy path, two down years including −15%, about 7% a year. The jar and tree lines are drawn side by side.
  3. Jar or tree?: sort 5 "when do you need it?" cards. A wrong pick gets a nudge; a right pick explains why.
  4. A 2-question check.
- **Chapter 3 — Your Slice Pays You.** Four micro-lessons:
  1. Pay the owners: $8 profit, $4 kept to grow, $1 per slice handed to You, Bear, Bunny and Frog.
  2. Spend or replant?: guess first, then 6 seasons comparing spending ($24 spent, still 4 slices) with replanting (about 11.9 slices).
  3. Real companies: flip cards for 9 brands kids know. KO, MCD, HSY, WMT and PEP pay dividends; TSLA, RBLX, NFLX and AMZN don't.
  4. A 2-question check.
- Every stage has a Luna speech bubble with read-aloud, a done-state explanation and a "💡 Remember" takeaway.
- Badges: Smart Saver and Dividend Detective, +15 points each.
- New tap-a-word cards: saving, investing, interest and dividend, each with "Play it" into the matching stage.
- The Start-here banner moves on to "Next chapter: …" until every chapter is done.
- All copy is in `shared/kidsQuestContent.ts`. All math is fixed and pure: `jarPath`, `treePath`, `snowball`.

## Acceptance criteria
- [x] Both chapters are playable end to end by tapping only, on phone and desktop (e2e)
- [x] Every new line is at reading grade 5 or below, and the money math is pinned (unit)
- [x] Chapter 1 is unchanged; old `?step=` links still work; no links out; no horizontal scroll at 390px
- [x] No prices, no advice: saving and investing are both presented as good tools, picked by when you need the money

## Test plan
- Unit: `tests/unit/kidsChapters.test.ts` covers reading level, jar, tree and snowball math, chapter completion, badges and points, and dividend cards.
- E2E: `tests/e2e/kids-chapters.spec.ts` covers the picker, Chapter 2, Chapter 3 and word-card jumps. `kids-quest.spec.ts` still plays Chapter 1.

## Out of scope
More chapters (taxes, compound interest on its own, risk and diversifying with real tickers); sound effects.
