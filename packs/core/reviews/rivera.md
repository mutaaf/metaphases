# Core pack review: Ms. Rivera (teacher and reading specialist)

> AI reviewer persona: a veteran elementary teacher (grades 1–5) and reading specialist. She checks reading level, pacing, misconceptions, scaffolding and engagement. A human still signs the checklist in moon-club `docs/PACKS.md`.

## Round 1: Approved with changes

**Must-fix (all applied)**
- **"Piggy bank" meant two opposite things.** Saving said a piggy bank "stays the same", but the Pretend Piggy Bank follows real prices. Now saving uses a **jar**, and `piggy-start` says "This piggy bank is different from a real one."
- **The budget's "Share" jar clashed with "a share" of a company.** It is now the **Give** jar. "The company shares" (verb) is reworded in the glossary.
- **Rule breaks.** A 23-word card (`expectations`) and a double negative ("Will you not need…", `which`) are fixed.
- **Track tags didn't match prerequisites.** Tracks are now cumulative: Little Moons (6-8) lessons are for everyone, and Big Moons (9-11) lessons build on them. `zoom-out` and `why-unsure` moved to 9-11.
- **Giveaway checks.** The right answer was often the longest, and distractors were jokes. Distractors are now mistakes kids really make: "The bank gives it out for free", "Money you spend right away", "$51" on the dividend-day check.

**Also applied**
- **One idea per lesson.** Profit moved out of `company`, and the market check moved out of `share`. `share` now heads off a real misconception: "you can't take toys from its store".
- **Concrete before abstract.** A money-in/money-out sort before the profit math; jellybeans in a jar before beat/miss; a $1/$2/$3 check before "the number to beat".
- **Sequence.** The Piggy unit comes right after Shares (the hands-on activity before the lessons that refer to it). Risk comes before the money snowball.
- **Repeats.** `report-jump` repeated `after`, so it now links report day to the chart (tall candle, big volume).
- **Brands.** Brand names stay only where they are the point (`ticker`).
- **Guess reveal.** It gained an "in line" line and a kind line for a wrong guess.
- **Piggy tips.** `bigRise` praised luck, so it now praises the habit. `peekMany` is warmer.
- **Accessibility note for the app.** Candle colors need an up/down arrow for color-blind kids.

## Round 2: Approved with changes → Approved

All must-fixes applied:
- `clues` moved to the end of Money-smart so Little Moons reach it. Its first card now points at the child's own Piggy Bank line.
- Market weather is "hopeful or worried", not "brave". ("Brave" frames buying as brave.)
- `owner` gained the check "Shop A's share costs $100, Shop B's costs $10. Which company is better?" The answer is "You can't tell from the price."

Should-fix items, also applied:
- Hard words for 6–8 year olds replaced: "eager", "recover", "stay flat".
- `piggy-spread` gained an eggs-in-one-basket card.
- The "fund" card moved out of `baskets` into the glossary.
- `interest` gained a distractor that checks the inflation card.
- The report-card tip now matches its lesson.

**Sign-off:** Core approved, 2026-11-03.

## Round 3: post-sign-off edits, approved
The reading-level gate forced three small edits after sign-off. All three were confirmed:
- the new 9-11 lesson `hindsight` ("Looking back is easy"), which restores the patterns unit to 3 lessons;
- simpler `mood` and `report` glossary cards.
- Distractor "Yes, the shape was a promise" (applied).

## Round 4 (Core 3.0.0, the 0.15 deepening): Approved with changes → Approved

39 new lessons, 7 new units (Earning money, Saving goals, Smart spending, Staying safe, Prices over time, Borrowing and interest, Baskets of companies), two new step types (worked examples and growth pictures) and a third, optional track.

**Must-fix (all applied)**
- **Percent before it was taught.** `compound` and `prices-rise` (Big Moons) used "%" cold. Each now says what it means first ("10% a year means $10 more for every $100").
- **`borrow` was out of reach.** A Little Moons lesson sat in a Big Moons unit, after `pay-ways` already said a credit card "borrows". It moved into Smart spending, before `pay-ways`.
- **Math beyond 6–8.** `goal` used ÷ and `boss` used ×. `goal` now counts by tens ($10, $20 … $60), and `boss` says "10 cups at $1" and defines profit in place, since Earning now comes before Companies.
- **`debt-snowball` ended on fear, about "you".** It is now about Max, and adds what helps: "Paying back on time, and in full, keeps what you owe small."
- **`sales-profit` jumped to an abstract check.** It now has a worked example first (sales $50, costs $30, then sales $60, costs $45: "Sold more, kept less!").
- **"A quarter" (`surprise`)** read as the 25¢ coin. It is now "one fourth of $2, or 25% more".
- **Fire (`insurance`).** It could frighten 6–9 year olds. It is now a cracked phone or a dented car, and the glossary example matches.
- **`scam-signs` taught trust by sender.** "The library" and "your teacher" were "Okay", but scammers copy trusted senders. The bucket is now "No red flag" with Grandma and Coach, and "Don't tell your parents" became "Don't tell any grown-up".
- **Giveaway answer.** `bank-safe`'s right answer was much longer than the others; all three are now the same length.

**Also applied**
- Risk is "things don't go the way you hope", not only "something bad".
- `beat-prices` no longer reads as "bank savings are bad".
- The Baskets order is now spread-groups → fund → fees → index, so "fees" is taught before it's used.
- `double` is honest about year 7 vs year 8 ("A near guess!"), and its distractors are real mistakes.
- `div-yield` is now "How big is the payout?" ("slice" already means a share), with a check that isn't a copy of the example.
- `paid` uses an hourly bake-sale wage (a dog walk paid per walk is not a wage), and `lender` dropped the renting card (one idea per lesson).
- "Credit union" is kept out of the 6–8 card. "You save $3" became "costs $3 less" ("save" means set aside).
- Joke distractors were replaced with real mistakes, long right answers were shortened, and a card that tied pay to worth now says "Every job helps someone".
- Staying safe now comes right after Smart spending, so Little Moons meet passwords and scams early.
- Talk prompts don't assume grandparents, parents or insurance at home.

**The third track.** Approved as "Full Moons (challenge)", with no ages in the title. Percent, the Rule of 72 and yield are grade-6 math, so calling them a challenge is honest. Challenge lessons come last in each unit and never gate stars, mastery or a land's boss quiz (app: `KidsContent.optionalTracks`).
