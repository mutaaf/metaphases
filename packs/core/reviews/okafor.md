# Core pack review: Dr. Okafor (markets expert)

> AI reviewer persona: a former sell-side equity analyst (consumer and tech) who now teaches finance. He checks that everything is accurate, nothing is misleading, every pattern is a clue (never a promise), and nothing is advice. A human still signs the checklist in moon-club `docs/PACKS.md`.

## Round 1: Approved with changes

### Must-fix (all applied)

**Dividend cut-off day.** Buying ON the cut-off (ex-dividend) day does not get the payout. Now: "You must own the share before that day to get the payout."

**Trend.** "Most days end higher" is not a trend, because a few big drops can outweigh many small gains. Now it is defined by higher highs and higher lows.

**Sideways.** Starting and ending at $10 is not sideways, because the price could have doubled in between. Now: "stays between $9 and $11 for a whole month".

**Moving average.** An average is not "the middle". Now: "$4, $6 and $5 add up to $15. Split by 3, the average is $5."

**Who gets paid.** Buying a share on the market does not pay the company. New card and check: "your money goes to the owner who sold it."

**Diversification.** Spreading out protects against one bad company, not a whole-market drop. New card: "If the whole market drops, most baskets drop together."

**Guess reveal.** The reveal lines stated a real stock's cause as fact. They are hedged now ("People may have liked the news").

### Also applied

**Earnings report wording**
- Estimates are profit **per share**, and the number to beat is their **average**.
- "Four times a year" is a US rule, so the text now says "big US companies".
- Earnings are the profit, and the earnings *report* is the report card.

**Price**
- Every trade has one buyer and one seller. What moves the price is which side wants the trade more.
- New card: why people want a share ("they think the company will make more profit later").

**Math and fair comparisons**
- "Others stay the same" is now stated in the piggy-spread math.
- The profit check counts all costs.
- The saving vs interest contradiction is fixed.
- New card: "A high price does not mean a better company."

**Hedges and caveats**
- "In the past, the **US** market…" ("history, not a promise").
- A green candle can still close below yesterday, and in some countries red means up.
- Interest is "often a little".
- An inflation card was added.
- Hedges on `which`, `patience`, `snowball`, `bigDrop` and "a company can cut or stop its dividend".
- "One *small* red day".

**New concepts**
- Funds as a ready-made basket.
- What owners vote on.

## Round 2: Approved

All round-1 items were verified. Polish was applied:
- "big US" added to the report-card tip and to the Earnings word.
- "Say $100 grows to $110" (an example, not a normal year).
- "The company's profit for each share" option.
- Fund wording ("Some shares are pieces of a fund").

**Sign-off:** Core approved, 2026-11-03.

## Round 3: post-sign-off edits, approved
The reading-level gate forced three small edits after sign-off. All three were confirmed:
- the new 9-11 lesson `hindsight` ("Looking back is easy"), which restores the patterns unit to 3 lessons;
- simpler `mood` and `report` glossary cards.

## Round 4 (Core 3.0.0, the 0.15 deepening): Approved with changes → Approved

**Arithmetic.** I recomputed every number and all are correct:
- Debt at 20%: 100 → 120 → 144 → 173 → 207.
- The cart at 3%: $134 by year 10, vs $105 for savings at 1% (year 5: 116 vs 105).
- 10% compound vs simple: 161 vs 150 at year 5.
- Fees: $1,000 at 6.9% vs 6% over 10 years is $1,949 vs $1,791.
- Rule of 72 at 8% gives 9 (exact: 9.006).
- Yield examples: 4% and 3%.
- Earnings per share, sales vs profit, wages, taxes and the savings-plan weeks.

`grow` values are rounded each year from the exact value; `growSeries` is pinned on web and app by the `grow` vectors.

**Must-fix (all applied)**
- **`spread-groups`.** The answer was too absolute: groups can all fall together, as in 2008. Now: "Different groups rarely all have a bad year at once. But in a big market drop, most fall together."
- **`double`.** "About 7 years" clashed with the picture ($195 at year 7). Now "A bit more than 7 years".
- **`sales-profit`.** "All the money that came in" is not revenue (loans also bring money in). Now "the money customers paid for what the company sold"; the Guess tip matches.
- **Glossary `inflation`.** One toy going up is not inflation. Now: "If most prices go up 3%, a $100 cart of food costs about $103 next year."

**Also applied**
- **`bank-safe`.** Banks pay interest because they lend savings out. Deposit insurance gets one card, with no dollar figure: "In the US, the government protects savings at most banks, up to a big limit."
- **`index`.** Now says "If they fall, the fund falls too." About 500 is accurate (the S&P 500 holds about 503 stocks).
- **`calendar`.** Now mentions after-hours trading. The check stays hedged ("usually").
- **`fees`.** The setup now says the funds hold the same companies, which grow 7% a year before fees.
- **`fund`.** Owning a fund share is indirect: "a tiny slice of the basket".
- **`buy-less`.** Starts "Say prices go up", so the toy stands for general inflation.
- **`taxes`.** Mentions sales tax.
- **Guess tip `surprise`.** No longer claims a tiny beat barely moves the price.
- **Objectives.** Codes were tightened. Topics with no standard before grade 8 are tagged "Enrichment".

**Checked and accurate:**
- the credit card grace period ("usually no interest if you pay the whole bill by the due date");
- debit vs credit;
- wage and salary;
- insurance and premium;
- the scam red flags;
- earnings per share;
- the dividend yield and cut caveat;
- the Guess `learn` links (a beat that dropped and a miss that rose both go to `expectations`);
- the Piggy `oneGroup` tip, which fires only with 2+ companies, so one company stays "one basket".

**"Why did it move?"** Each clue now names the lesson that teaches it (`learn`). Report day picks `expectations` when the price "disagreed" with the result, `guidance` when it was in line, and `after` otherwise. The engine's words and weights are unchanged.
