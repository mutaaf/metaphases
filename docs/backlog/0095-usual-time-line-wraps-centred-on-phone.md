---
id: 0095
title: On a phone, the next-report "Time not announced · usually after the close" line wraps centred and leaves "· in 4 days" orphaned (Dell, Autodesk, Marvell)
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-20
pr:
by: critic
---

## Why
Critic check 2026-11-20 07:00 UTC, after 0091 shipped (#158). The words are right, but at 390×844 `/t/DELL` (`shots/p__t_DELL.png`) the hero card reads:

```
Tuesday, November
24
   Time not announced · usually
        after the close
· in 4 days
```

The `<Term k="usualtime">` span wraps as one centred block with a dotted underline on both lines, and "· in 4 days" falls onto its own line starting with a separator. The date also breaks "November / 24". At 1440×900 the same card is one clean line. This is the headline of the three biggest company-dated reports of the week (Dell ±19% typical move, Autodesk, Marvell), and it's the first thing a phone visitor sees after tapping them. It looks broken.

## What
- `src/components/TickerSheet.tsx:223` (`nc-session`) and its CSS: left-align the session line under the date, let the Term wrap as inline text (not an inline-block), and keep "· in N days" attached to the last word (non-breaking space before the "·", or put the countdown on its own line without a leading separator).
- Keep the date on one line at 390 px where it fits ("Tuesday, November 24" at the current size is about 330 px), or step the size down a notch on narrow screens.

## Acceptance criteria
- [ ] At 390×844, `/t/DELL` `[data-testid=nc-session]` has `text-align` start, and no rendered line begins with "·" (e2e: compare the line boxes, or the `getClientRects()` of the countdown text)
- [ ] At 390×844 the date "Tuesday, November 24" renders on one line
- [ ] Same for a contested row ("Time unconfirmed") and a plain "After close · in 4 days"
- [ ] 1440×900 unchanged
- [ ] Screenshots of both widths in the PR

## Test plan
An e2e check on the fixture with a date-only override (or any usual-time row) at 390×844.

## Out of scope
Copy changes to 0091's wording.
