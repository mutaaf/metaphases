---
id: 0030
title: Kids learn by doing — Luna's Lemonade Stand quest and tap-a-word picture cards
status: shipped
priority: P1
size: M
lens: user-value
created: 2026-11-02
pr: 28
by: operator
---

## Why
The operator: "kids won't know what a share is, or what a company is, or what half these things are, so we need to make it more interactive and engaging." The Story, Guess and Piggy Bank cards assumed a 9-year-old already knew company, share, profit, price and report card.

## What
- **Luna's Lemonade Stand** (`/kids/start`, "Start here" banner on Story and Moon School until finished): four playable stages — sell 10 cups (money in − lemons = profit → a company), cut the stand into 4 slices and sell 3 to friends (shares), tap buyers/sellers to push the price to $8 then $4 (prices), guess and open the stand's report card (beat/miss). Finishing earns the Lemonade Boss badge (+15 pts).
- **Tap-a-word**: every tricky word on a card is a tappable picture card (emoji, one sentence, example, read-aloud, "Play it" jumps to the matching quest stage). Inline on Guess and Piggy intros; a "What's that word?" chip row on story cards.
- All copy in `shared/kidsContent.ts` (`KID_TERMS`, `QUEST`), held to reading grade ≤ 5 by a unit test.

## Acceptance criteria
- [x] A new kid can play the whole quest by tapping only (e2e on phone and desktop)
- [x] Word cards open from story cards without turning the card, and "Play it" lands on the right stage
- [x] Reading level ≤ 5 for every word card and quest line; no links out; no horizontal scroll at 390px

## Test plan
Unit: `tests/unit/kidsQuest.test.ts` (reading level, word coverage, badge/points). E2E: `tests/e2e/kids-quest.spec.ts` plays the quest end to end, opens word cards, checks phone fit and no links out.

## Out of scope
Sound effects; more quest chapters (dividends, saving vs investing) — good next tickets.
