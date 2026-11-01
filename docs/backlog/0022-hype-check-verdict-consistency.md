---
id: 0022
title: Hype Check's red-flag badge contradicts the cards under it, and "the next Tesla" pulls in a TSLA card
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-01
pr:
by: critic
---

## Why
Hype Check is the Everyday persona's front door (control.json focus #1: "every flag and number traceable"). Tested at 390×844 on 2026-11-01 with the caption `$NIO is going to the MOON 🚀🚀 next Tesla, earnings next week, load up before it 10x!!` (screenshot `e-check-NIO.png`):
- **Tesla: "NO RED FLAGS"** in green, then directly under it a bordered warning card "Expensive compared with its profits … the price can fall far", plus quality grade **D**. The headline tells her it's clean and the body says it isn't.
- **NIO: "2 RED FLAGS"**, but three warning cards follow. **PLTR: "1 RED FLAG"** with three cards; **SOUN: "2 RED FLAGS"** with four. The count leaves out `tone: "info"` flags (`src/pages/Check.tsx:70`), but those render as the same kind of card, just with a blue border.
- "next Tesla" is a comparison, not a stock the post is pushing, yet it produces a full Tesla card with "Watch it instead", which doubles the reading and invites a pivot to a stock nobody mentioned. (The name match is in `src/lib/hype.ts`.)

## What
- Make the badge count every card shown under it, or render `info` items in a visually distinct, lighter "Worth knowing" group that the badge doesn't count. Either way, the number on the badge equals the number of cards it labels.
- A green "No red flags" must not appear when the quality grade is D or F, or when any warning card shows. Use a neutral "Nothing alarming in the numbers" only when the list is truly empty.
- Don't treat a company name as a mention when it's preceded by "next", "the new", "like" or "than" (for example "the next Tesla" or "bigger than Nvidia"). A cashtag always counts.

## Acceptance criteria
- [ ] Unit: for each fixture (NIO, TSLA, PLTR, SOUN), the badge number equals the number of cards in the red/amber group
- [ ] Unit: `extract("$NIO … next Tesla …")` returns `["NIO"]` only; `extract("$NIO and $TSLA")` returns both
- [ ] e2e at 390×844: the TSLA fixture with quality D doesn't show the text "No red flags"
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Extend `tests/unit/everyday.test.ts` (extraction and flag grouping) and `tests/e2e/everyday.spec.ts` (badge text vs card count).

## Out of scope
New flag types and the AI "hype" task.
