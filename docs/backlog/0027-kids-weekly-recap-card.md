---
id: 0027
title: Kids weekly recap — "your week in the Moon Club" card a grown-up can print or share
status: shipped
priority: P2
size: M
lens: engagement
created: 2026-11-02
pr: 27
by: operator
---

## Why
Kids remember what they can show someone. A once-a-week recap ("You guessed 3 report cards and got 2 right! Your pretend piggy bank grew 1.4%. You finished 'What is a share?'") turns a week of taps into a moment to talk about with a parent — the real goal of Metaphases Kids. It also gives the grown-up something to share in the family chat without the kid ever touching a social app.

## What
- A recap card on the Story page every Friday (or the first visit after), built from `metaphases:kids:v1` only: guesses and results this week, piggy bank change, lessons finished, new badges, level progress.
- Read-aloud, and a "Show a grown-up" button that opens the parental gate, then offers a 9:16 image via a new worker route `/og/story/kids-recap.png?…` whose query carries only counts (no names, no free text). Never shared from the kid side.

## Acceptance criteria
- [x] Recap renders from local data only; no network call except the gated image
- [x] The image contains no personal data and no prices beyond percentages
- [x] Sharing is only reachable behind the parental gate
- [x] Works at 390×844 and 1440×900; reading level ≤ grade 5

## Test plan
Unit: recap builder from a fixture state. E2E: Friday clock → card visible; share is gated.

## Out of scope
Push notifications; any server-side storage.
