---
id: 0029
title: Printable Moon School worksheets for each lesson
status: shipped
priority: P2
size: S
lens: user-value
created: 2026-11-02
pr: 27
by: operator
---

## Why
Parents and teachers want screen-free follow-ups. A one-page worksheet per lesson (the idea, a drawing prompt, the two quiz questions, and "find a company you use at home") makes Metaphases Kids useful at the kitchen table and in classrooms.

## What
A print stylesheet plus a `/kids/school/<id>/print` view (reachable from the Grown-up corner, behind the gate) that lays out a lesson on one A4/Letter page in the brand style: Luna, the lesson text, the quiz with answer lines, and a small answer key at the bottom (upside-down). Built from `shared/kidsContent.ts` — no new content source.

## Acceptance criteria
- [x] Every lesson prints on exactly one page in Chrome and Safari (Letter and A4)
- [x] No tab bar, header chrome or links in print
- [x] Reachable only from the Grown-up corner

## Test plan
E2E: `page.pdf()` for two lessons → 1 page each; the print view contains the lesson title and both questions.

## Out of scope
New lessons; translations.
