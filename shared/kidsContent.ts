// Moon School lessons and kid words for Metaphases Kids. Written for a 9-year-old (grade 3–4):
// short sentences, everyday words, one idea per lesson. A unit test keeps every lesson at a
// Flesch–Kincaid grade of 5 or below — if you edit, keep it simple.

// Moon School is a set of MICRO-LESSONS (about a minute each), grouped into units. Each lesson is
// a few tiny steps: one emoji + one short sentence per card, with a quick check or a sorting game
// in between. `screens` and `quiz` are derived for the worksheets and the quiz of the day.
export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface SortItem { emoji: string; text: string; b: 0 | 1 }
export type Step =
  | { t: "say"; emoji: string; text: string }
  | { t: "check"; q: string; options: string[]; answer: number; why: string }
  | { t: "sort"; q: string; buckets: [string, string]; items: SortItem[]; why: string };
export interface Unit { id: string; title: string; emoji: string; blurb: string }
export interface Lesson { id: string; unit: string; title: string; emoji: string; steps: Step[]; screens: string[]; quiz: Quiz[] }

export const UNITS: Unit[] = [
  { id: "money", title: "Money basics", emoji: "💰", blurb: "What money is, and how to plan it." },
  { id: "companies", title: "Companies", emoji: "🏪", blurb: "Who makes the things you love." },
  { id: "shares", title: "Shares and the market", emoji: "🍕", blurb: "Owning a tiny slice." },
  { id: "report", title: "Report cards", emoji: "📝", blurb: "How companies show their grades." },
  { id: "growing", title: "Saving and investing", emoji: "🌱", blurb: "Keep it safe, or help it grow." },
  { id: "dividends", title: "Dividends", emoji: "🍰", blurb: "When your slice pays you." },
  { id: "smart", title: "Money-smart", emoji: "🧠", blurb: "Spread out, be patient, check facts." },
  // Market World (the Moon Club app's map): reading a chart, one idea at a time. Clues, never promises.
  { id: "candles", title: "Candles", emoji: "🕯️", blurb: "A whole day of a price in one tiny picture." },
  { id: "trends", title: "Trends", emoji: "🛤️", blurb: "Up, down or sideways over many days." },
  { id: "patterns", title: "Floors and ceilings", emoji: "⛰️", blurb: "Spots a price keeps bouncing off." },
  { id: "signals", title: "Busy days and smooth lines", emoji: "🌊", blurb: "Volume, averages and report-day jumps." },
];

const say = (emoji: string, text: string): Step => ({ t: "say", emoji, text });
const check = (q: string, options: string[], why: string, answer = 0): Step => ({ t: "check", q, options, answer, why });
const sort = (q: string, buckets: [string, string], items: SortItem[], why: string): Step => ({ t: "sort", q, buckets, items, why });
const L = (unit: string, id: string, title: string, emoji: string, steps: Step[]): Lesson => ({
  id, unit, title, emoji, steps,
  screens: steps.flatMap((x) => (x.t === "say" ? [x.text] : [])),
  quiz: steps.flatMap((x) => (x.t === "check" ? [{ q: x.q, options: x.options, answer: x.answer, why: x.why }] : [])),
});

export const LESSONS: Lesson[] = [
  // ── Money basics ──
  L("money", "money", "What is money?", "💵", [
    say("🐄", "Long ago, people traded things. A cow for some bread!"),
    say("🤔", "That was hard. What if the baker did not want a cow?"),
    say("💵", "So people made money. Everyone agrees it is worth something."),
    check("Why did people make money?", ["To make trading easy", "Because cows are boring", "To use as paper"], "Money makes trading easy, because everyone takes it."),
  ]),
  L("money", "earn", "Where does money come from?", "🧑‍🍳", [
    say("🧑‍🍳", "Grown-ups earn money by doing work. A cook cooks. A nurse helps sick people."),
    say("🍋", "Kids can earn too! You can sell lemonade or help a neighbor."),
    say("⏰", "Earning takes time and work. That is why money matters."),
    check("How do most grown-ups get money?", ["By working", "It grows on trees", "They print it at home"], "Most grown-ups earn money by doing a job."),
  ]),
  L("money", "needs", "Needs and wants", "🎒", [
    say("🍎", "A need is something you must have. Like food, a home and clothes."),
    say("🎮", "A want is something nice to have. Like a new game or candy."),
    sort("Is it a need or a want?", ["Need", "Want"], [
      { emoji: "🍎", text: "Food", b: 0 }, { emoji: "🎮", text: "A new game", b: 1 }, { emoji: "🧥", text: "A warm coat", b: 0 },
      { emoji: "🍭", text: "Candy", b: 1 }, { emoji: "🏠", text: "A home", b: 0 }, { emoji: "🧸", text: "One more toy", b: 1 },
    ], "Needs come first. Wants come next, if there is money left."),
  ]),
  L("money", "budget", "Make a money plan", "📋", [
    say("📋", "A budget is a plan for your money. You plan before you spend."),
    say("🫙", "Try three jars: Spend, Save and Share. Put some money in each one."),
    say("✅", "When you see something fun, check your Spend jar first."),
    check("A budget is…", ["A plan for your money", "A kind of candy", "A piggy bank"], "A budget is a plan. It helps you choose before you spend."),
  ]),
  // ── Companies ──
  L("companies", "company", "What is a company?", "🏪", [
    say("👟", "A company is a team of people. They work together to sell something."),
    say("🎮", "Some sell things you can hold, like shoes or toys. Some sell things you use, like games or videos."),
    say("✨", "When people buy what it sells, the company gets money. If it gets more than it spends, the extra is profit."),
    check("What does a company do?", ["Sells things to people", "Only plays games", "Makes the weather"], "A company sells things or services to people."),
    check("Profit is…", ["Money left after paying the bills", "A kind of fruit", "All the money a company spends"], "Profit is the money left after the bills are paid."),
  ]),
  L("companies", "profit", "Money in, money out", "🧾", [
    say("💵", "Money in is all the money a company gets from selling things."),
    say("🧾", "Money out is what it pays for. Workers, rent and supplies."),
    say("✨", "Money in minus money out is profit. If money out is bigger, that is a loss."),
    check("A shop sells $20 of cookies. The flour cost $5. What is the profit?", ["$15", "$25", "$5"], "$20 take away $5 is $15."),
  ]),
  L("companies", "grow", "How companies grow", "🌱", [
    say("🍋", "A lemonade stand can grow into a lemonade shop."),
    say("🧱", "To grow, it needs money for a bigger shop and more workers."),
    say("🍕", "One way to get that money is to sell shares of the company."),
    check("Why might a company sell shares?", ["To get money to grow", "To get smaller", "Just for fun"], "Selling shares brings in money the company can use to grow."),
  ]),
  // ── Shares and the market ──
  L("shares", "share", "What is a share?", "🍕", [
    say("🍕", "Think of a big company like a pizza cut into lots and lots of slices."),
    say("🧩", "Each slice is called a share. If you own a share, you own a tiny piece of that company."),
    say("🏟️", "People buy and sell shares in a place called the stock market. Grown-ups need a special account to do it."),
    check("If you own a share of a company, you own…", ["A tiny piece of it", "The whole company", "One of its stores"], "A share is a tiny slice of the company. Like one slice of a pizza."),
    check("Where do people buy and sell shares?", ["The stock market", "The toy store", "The bank vault"], "Shares are bought and sold on the stock market."),
  ]),
  L("shares", "owner", "Being an owner", "👑", [
    say("👑", "If you own a share, you are a part owner of the company."),
    say("🗳️", "Owners can vote on some big choices. One share is one vote."),
    say("📈", "If the company does well, your share can be worth more."),
    check("Owning one share of Nike makes you…", ["A tiny part owner of Nike", "The boss of Nike", "A Nike worker"], "One share makes you a tiny part owner. Lots of other people own parts too."),
  ]),
  L("shares", "market", "The stock market", "🏟️", [
    say("🏟️", "The stock market is a big place where people buy and sell shares."),
    say("💻", "Today it is mostly on computers. It opens in the morning and closes in the afternoon."),
    say("🔔", "In New York, a bell rings to start the day and to end it!"),
    check("What do people trade on the stock market?", ["Shares", "Pets", "Pizza"], "The stock market is where shares are traded."),
  ]),
  L("shares", "prices", "Why do prices go up and down?", "🎢", [
    say("🏷️", "The price of a share is what someone will pay for it right now."),
    say("🙋", "When lots of people want to buy, the price goes up. When lots want to sell, it goes down."),
    say("🃏", "It is a bit like trading cards. When everyone wants a card, people will give more for it."),
    say("〰️", "Prices move every day. Small ups and downs are normal."),
    check("If lots of people want to buy a share, the price…", ["Goes up", "Goes down", "Stays stuck"], "More buyers than sellers pushes the price up."),
    check("Is it normal for prices to move a little every day?", ["Yes", "No, never"], "Prices wiggle every day. That is normal."),
  ]),
  L("shares", "ticker", "Ticker nicknames", "🔤", [
    say("🔤", "Each company has a short nickname. It is called a ticker."),
    say("🍎", "Apple is AAPL. Disney is DIS. Coca-Cola is KO."),
    say("👀", "Grown-ups use tickers to find a company fast."),
    check("What is DIS?", ["Disney's ticker", "A kind of dish", "A dinosaur"], "DIS is Disney's short nickname on the stock market."),
  ]),
  // ── Report cards ──
  L("report", "report-card", "What is a report card?", "📝", [
    say("🎒", "You get a report card from school. Companies get one too!"),
    say("📅", "Four times a year, each company tells everyone how it did. Grown-ups call this an earnings report."),
    say("💵", "It says how much money came in, and how much profit the company made."),
    say("🌙", "Metaphases shows when each company will share its report card. We draw the time as a moon."),
    check("How many times a year does a company share its report card?", ["4 times", "Once", "Every day"], "Companies report four times a year, once every three months."),
    check("What do grown-ups call a company's report card?", ["An earnings report", "A gift card", "A birthday card"], "It is called an earnings report."),
  ]),
  L("report", "guess", "The grown-ups' guess", "🔮", [
    say("🔮", "Before a report card, experts guess the profit."),
    say("📊", "They put all the guesses together and find the middle. That is the number to beat."),
    say("⏳", "Then everyone waits to see what really happened."),
    check("What are the experts guessing?", ["The company's profit", "The weather", "Tomorrow's lunch"], "They guess the profit, so we can see if the company beats it."),
  ]),
  L("report", "beat", "What does \"beat\" mean?", "🎯", [
    say("🔮", "Before a report card comes out, grown-ups make a guess. They guess how much profit the company will make."),
    say("🎯", "If the company makes more than the guess, it beat. If it makes less, it missed."),
    say("🤷", "Sometimes a company beats and the price still goes down. People may have hoped for even more!"),
    check("Grown-ups guessed $2. The company made $3. Did it beat or miss?", ["Beat", "Miss"], "$3 is more than the $2 guess, so it beat."),
    check("Can a price go down even when a company beats?", ["Yes, sometimes", "No, never"], "Yes! People may have hoped for even more good news."),
  ]),
  L("report", "after", "Why prices jump on report day", "🎢", [
    say("📝", "On report card day, prices can jump up or fall down fast."),
    say("😮", "That is because people learn lots of new facts all at once."),
    say("🔭", "People also hear what the company thinks comes next."),
    check("Why can a price jump on report card day?", ["People learn new facts all at once", "The building moves", "It is a holiday"], "New facts arrive all at once, so people change their minds fast."),
  ]),
  // ── Saving and investing ──
  L("growing", "saving", "Saving vs investing", "🐷", [
    say("🐷", "Saving is keeping your money safe, like in a piggy bank. It stays the same."),
    say("🌳", "Investing is using money to buy things like shares. It can grow, but it can also shrink."),
    say("🤝", "Grown-ups often do both. They save money they need soon. They invest money they will not need for a long time."),
    check("Money in a piggy bank…", ["Stays the same", "Grows by itself", "Turns into shares"], "Saved money stays the same. It does not grow or shrink."),
    check("Investing can make money…", ["Grow or shrink", "Only grow", "Go away for sure"], "Investing can go up or down. That is the risk."),
  ]),
  L("growing", "interest", "Interest: a little extra", "🏦", [
    say("🏦", "A bank keeps your money safe. It even pays you a little to keep it there."),
    say("🪙", "That little extra is called interest. Put in $100, and a year later you may have $102."),
    say("🐢", "Interest is slow, but it is safe."),
    check("Interest is…", ["A little extra money the bank pays you", "A fee to play games", "A kind of share"], "It is the small extra the bank adds to your money."),
  ]),
  L("growing", "snowball", "The money snowball", "⛄", [
    say("⛄", "Roll a snowball and it picks up more snow. It gets bigger faster and faster."),
    say("💰", "Money can do that too. The money you grow can grow more money."),
    say("⏳", "That is why starting early helps. Time makes the snowball big."),
    check("Why does starting early help?", ["More time for the snowball to grow", "Banks like kids best", "It does not help"], "More years means more time for growth to pile up."),
  ]),
  L("growing", "risk", "Risk: ups and downs", "🎢", [
    say("🎢", "Risk means things might not go the way you hope."),
    say("🫙", "A savings jar has low risk. It will not grow much, but it will not shrink."),
    say("🌳", "Investing has more risk. It can grow more, but some years it goes down."),
    sort("Low risk or high risk?", ["Low risk", "High risk"], [
      { emoji: "🐷", text: "Money in a piggy bank", b: 0 }, { emoji: "🚀", text: "All your money in one new company", b: 1 },
      { emoji: "🏦", text: "Money in a bank", b: 0 }, { emoji: "📣", text: "A stock a video says will go to the moon", b: 1 },
    ], "Safe places grow slowly. Big promises can go up or down a lot."),
  ]),
  L("growing", "which", "Save it or invest it?", "🤔", [
    say("🗓️", "Need the money soon? Save it. Then it will be there when you need it."),
    say("🌳", "Will you not need it for many years? Investing gives it time to grow."),
    sort("Save it or invest it?", ["Save", "Invest"], [
      { emoji: "🧸", text: "A toy next week", b: 0 }, { emoji: "🎓", text: "College in 10 years", b: 1 },
      { emoji: "🎂", text: "A gift for mom this month", b: 0 }, { emoji: "🏡", text: "When you are a grown-up", b: 1 },
    ], "Soon means save. A long time means it can be invested."),
  ]),
  // ── Dividends ──
  L("dividends", "dividend", "What is a dividend?", "🍰", [
    say("🍰", "Some companies share part of their profit with their owners. That is a dividend."),
    say("🪙", "If you own a share, you might get a little money every few months."),
    say("🥤", "Coca-Cola and McDonald's pay them. Some do not."),
    check("A dividend is…", ["Profit a company shares with its owners", "A kind of pizza", "A school test"], "It is a bit of the profit. The owners get it."),
  ]),
  L("dividends", "no-dividend", "Why some don't pay", "🚀", [
    say("🚀", "Some companies keep all their profit to grow faster."),
    say("🔧", "They build new things, hire workers and open new stores."),
    say("🤞", "Owners hope the company grows. Then their shares may be worth more later."),
    check("Why might a company skip dividends?", ["To use the money to grow", "Because it forgot", "It is against the rules"], "Some companies use all their profit to grow."),
  ]),
  L("dividends", "replant", "Spend it or plant it?", "🌻", [
    say("🌻", "When you get a dividend, you can spend it. Or you can use it to buy more shares."),
    say("⛄", "Buying more shares is like adding snow to your snowball."),
    say("📅", "Over many years, that can grow a lot."),
    check("Using dividends to buy more shares is like…", ["Adding snow to a snowball", "Throwing seeds away", "Eating all the cake"], "More shares can pay you more. So the snowball grows."),
  ]),
  // ── Money-smart ──
  L("smart", "baskets", "Don't put all your eggs in one basket", "🧺", [
    say("🥚", "Imagine you carry all your eggs in one basket. If you trip, they all break!"),
    say("🧺", "If you split them into many baskets, one trip only breaks a few."),
    say("🍕", "Money works the same way. Owning a little of many companies is safer than a lot of one."),
    say("🐷", "Grown-ups call this spreading out. You can try it in your Piggy Bank."),
    check("Why split your eggs into many baskets?", ["So one trip doesn't break them all", "Baskets are pretty", "Eggs like company"], "If one basket falls, the others are still safe."),
    check("Which is safer?", ["A little of many companies", "All your money in one company"], "Spreading out means one bad day hurts less."),
  ]),
  L("smart", "patience", "Be patient like the moon", "🌙", [
    say("🌙", "The moon takes about a month to go from new moon to full moon. It does not rush."),
    say("📈", "Good companies can grow over many years. Some days their price goes down. Some days it goes up."),
    say("🐢", "People who wait a long time often do better than people who buy and sell every day."),
    check("Good investing is usually…", ["Slow and patient", "Fast and wild", "Done every minute"], "Waiting a long time usually works best."),
    check("If a price goes down for one day, should you panic?", ["No, small drops are normal", "Yes, always"], "Prices go up and down. One bad day is normal."),
  ]),
  L("smart", "hype", "Hype vs facts", "📣", [
    say("📣", "Sometimes a video says a stock will go to the moon. That is called hype."),
    say("🎭", "Hype is exciting. But the person in the video might be trying to sell, or might just be wrong."),
    say("🔍", "Facts are things you can check, like how much profit a company made."),
    say("❓", "Before you believe a video, ask: What are the facts? Who is telling me this? Why?"),
    check("A video says \"this stock will go to the moon!\" That is…", ["Hype", "A fact", "A school rule"], "It's an exciting guess, not a fact you can check."),
    check("What should you do before believing a video?", ["Check the facts", "Tell everyone right away", "Buy right now"], "Always check the facts, and ask a grown-up."),
  ]),
  L("smart", "too-good", "Too good to be true", "🚩", [
    say("🚩", "If someone promises lots of money, fast and for sure, that is a red flag."),
    say("🕵️", "Real investing has ups and downs. Nobody can promise it only goes up."),
    say("🙋", "If it feels too good to be true, stop and ask a grown-up."),
    check("Someone says \"Double your money by Friday, for sure!\" What do you do?", ["Stop and ask a grown-up", "Send them your money", "Tell them your password"], "Big promises that are for sure are a red flag. Ask a grown-up."),
  ]),
  // ── Candles ──
  L("candles", "candle", "What's a candle?", "🕯️", [
    say("🕯️", "A candle is a tiny picture of one day of a price."),
    say("📊", "The fat part is the body. It shows where the price started and where it ended."),
    say("📈", "Green means the price ended higher than it started. Red means it ended lower."),
    check("A candle is green. What happened that day?", ["The price ended higher", "The price ended lower", "Nothing at all"], "Green means it ended higher than it started."),
  ]),
  L("candles", "wicks", "Wicks and colors", "📊", [
    say("🕯️", "The thin lines on the top and bottom are called wicks."),
    say("📈", "The top of the wick is the highest price that day. The bottom is the lowest."),
    say("🎢", "A long wick means the price went far, then came back."),
    check("What does the top of the wick show?", ["The highest price that day", "The price next year", "How many people own it"], "The top of the wick is the highest the price got that day."),
    sort("Green or red candle?", ["Green", "Red"], [
      { emoji: "👍", text: "Starts at $5, ends at $8", b: 0 }, { emoji: "👎", text: "Starts at $9, ends at $6", b: 1 },
      { emoji: "👍", text: "Starts at $2, ends at $3", b: 0 }, { emoji: "👎", text: "Starts at $7, ends at $4", b: 1 },
    ], "Ended higher is green. Ended lower is red."),
  ]),
  L("candles", "tug-of-war", "Tug-of-war days", "🤝", [
    say("🤝", "Some days, buyers and sellers pull hard both ways, like a game of tug-of-war."),
    say("🕯️", "The price goes way up and way down, but ends near where it started."),
    say("📊", "That candle has a tiny body and long wicks on top and bottom."),
    check("A candle has a tiny body and long wicks. What kind of day was it?", ["A tug-of-war day", "A calm day", "A day with no trading"], "Long wicks and a tiny body mean the price swung both ways."),
  ]),
  // ── Trends ──
  L("trends", "trend", "What's a trend?", "📈", [
    say("🛤️", "A trend is the way a price is going over many days."),
    say("📈", "If most days end higher, the trend goes up."),
    say("🎢", "If most days end lower, the trend goes down."),
    say("〰️", "Prices wiggle every day. Look at the big picture, not one day."),
    check("A price wiggles but keeps climbing for a month. The trend is…", ["Up", "Down", "Sideways"], "It keeps climbing, so the trend is up, even with wiggles."),
  ]),
  L("trends", "sideways", "Sideways days", "〰️", [
    say("〰️", "Sometimes a price goes up, then down, then up again, but stays in the same place."),
    say("🛤️", "That is a sideways trend. It is like walking on flat ground."),
    check("A price starts at $10. After a month of wiggles it is still $10. The trend is…", ["Sideways", "Up", "Down"], "It ended where it started, so it went sideways."),
    say("🤞", "A trend shows what already happened. It does not promise what comes next."),
    check("Does an up trend promise the price will keep going up?", ["No, it can change", "Yes, always"], "A trend can change any day. It is a clue, not a promise."),
  ]),
  L("trends", "zoom-out", "Zoom out", "🔭", [
    say("🔭", "One day can look scary. Ten days can tell a calmer story."),
    say("📈", "Zoom out to see more days. The trend is easier to spot."),
    say("🐢", "People who invest for years look at years, not days."),
    check("One red day in a month of green days. What is the trend?", ["Still up", "Now down", "Sideways"], "One red day does not change a month of going up."),
  ]),
  // ── Floors and ceilings ──
  L("patterns", "floor-ceiling", "Floors and ceilings", "🪜", [
    say("🪜", "Sometimes a price keeps falling to the same low spot, then bounces. That spot is the floor."),
    say("🏠", "Sometimes a price keeps stopping at the same high spot. That spot is the ceiling."),
    say("🔤", "Grown-ups call the floor support. They call the ceiling resistance."),
    check("A price keeps bouncing up from $20. What is $20?", ["The floor", "The ceiling", "The wick"], "A spot it keeps bouncing up from is the floor."),
  ]),
  L("patterns", "breakout", "Breakouts", "🚀", [
    say("🚀", "When a price pushes up through its ceiling, that is a breakout."),
    say("🎢", "When a price falls through its floor, that is a breakdown."),
    say("🤔", "Lots of breakouts fail. The price can fall right back. That is normal!"),
    check("The ceiling was $50. Now the price is $55. What happened?", ["A breakout", "A breakdown", "Nothing"], "It pushed up through the ceiling. That is a breakout."),
  ]),
  L("patterns", "clues", "Clues, not promises", "🤞", [
    say("🕵️", "Shapes on a chart are clues. They show what happened before."),
    say("🤞", "A clue is not a promise. News and surprises can change the price fast."),
    say("🙋", "People who know a lot still guess wrong. That is normal."),
    check("A chart shows a shape you know. What does it mean?", ["It is a clue, not a promise", "The price must go up", "Buy right now"], "A shape is only a clue. Nobody knows for sure what comes next."),
    check("Who knows for sure what a price will do next?", ["Nobody", "A video", "My friend"], "Nobody can know for sure. Not even experts."),
  ]),
  // ── Busy days and smooth lines ──
  L("signals", "volume", "Volume", "🔊", [
    say("🔊", "Volume means how many shares people traded in a day."),
    say("📣", "A busy day has lots of trading. A quiet day has a little."),
    say("📝", "Report card days are often busy. Lots of people react to the news."),
    check("What does volume tell you?", ["How many shares were traded", "How loud the market is", "The price next week"], "Volume counts how many shares changed hands."),
  ]),
  L("signals", "moving-average", "The smooth line", "〰️", [
    say("〰️", "Prices zig and zag. That can make the trend hard to see."),
    say("➕", "A moving average takes the last few prices and finds the middle."),
    say("📈", "That makes a smooth line. It helps you see the trend."),
    check("Why do people use a moving average?", ["To see the trend more easily", "To make the price go up", "To count shares"], "The smooth line hides the wiggles, so the trend is easier to see."),
  ]),
  L("signals", "report-jump", "Report-day jumps", "🎢", [
    say("📝", "On report card day, a price can jump up or drop down fast."),
    say("👍", "A beat can make a price jump. But not always!"),
    say("😮", "Sometimes a company beats and the price still drops. People wanted even more."),
    check("A company beat the guess. Will the price always go up?", ["No, not always", "Yes, always"], "Not always. People may have wanted even more."),
  ]),
];
export const lessonUnit = (l: Lesson) => UNITS.find((u) => u.id === l.unit)!;

export interface KidWord { word: string; means: string; example: string }
export const KID_WORDS: KidWord[] = [
  { word: "Share", means: "A tiny piece of a company that you can own.", example: "If Disney was a pizza, one share is one small slice." },
  { word: "Profit", means: "The money a company has left after it pays all its bills.", example: "You sell lemonade for $10. The lemons cost $4. Your profit is $6." },
  { word: "Earnings", means: "A company's report card. It says how much profit it made.", example: "Apple shares its earnings four times a year." },
  { word: "Beat", means: "When a company does better than grown-ups guessed.", example: "Grown-ups guessed $1. It made $2. It beat!" },
  { word: "Miss", means: "When a company does worse than grown-ups guessed.", example: "Grown-ups guessed $2. It made $1. It missed." },
  { word: "Stock market", means: "The place where people buy and sell shares.", example: "It's like a giant trading card swap, but for companies." },
  { word: "Price", means: "What someone will pay for one share right now.", example: "If many people want a share, its price goes up." },
  { word: "Invest", means: "Using money now so it might grow later.", example: "Planting a seed so it can grow into a tree." },
  { word: "Save", means: "Keeping money safe so you can use it later.", example: "Putting coins in a piggy bank." },
  { word: "Spread out", means: "Owning a little of many things instead of a lot of one.", example: "Not putting all your eggs in one basket." },
  { word: "Hype", means: "Lots of excited talk that might not be true.", example: "\"This will go to the moon!\" is hype, not a fact." },
  { word: "Market weather", means: "How brave or worried people feel about buying shares.", example: "Sunny means people feel brave. Cloudy means they feel worried." },
];

// ── Tap-a-word: picture cards for every word a kid meets on a card (unit-tested reading level) ──
export type QuestStage = "company" | "shares" | "price" | "report";
/** Where "Play it" jumps: a lemonade stage, or a later chapter's stage ("save:jar", "dividends:payout"). */
export type QuestPlay = QuestStage | `save:${string}` | `dividends:${string}`;
export interface KidTerm { word: string; emoji: string; means: string; example: string; play?: QuestPlay }
export const KID_TERMS = {
  company: { word: "Company", emoji: "🏪", means: "A team of people who sell something to make money.", example: "Nike is a company. It sells sneakers.", play: "company" },
  profit: { word: "Profit", emoji: "✨", means: "The money left after a company pays its bills.", example: "You sell lemonade for $10. The lemons cost $4. You keep $6.", play: "company" },
  share: { word: "Share", emoji: "🍕", means: "A tiny slice of a company that someone can own.", example: "Cut a pizza into 4 slices. One slice is one share.", play: "shares" },
  stock: { word: "Stock market", emoji: "🏟️", means: "A big market where people buy and sell shares.", example: "It is like a giant swap meet for slices of companies.", play: "price" },
  price: { word: "Price", emoji: "🏷️", means: "What someone will pay for one share right now.", example: "When lots of kids want a card, it costs more.", play: "price" },
  report: { word: "Report card", emoji: "📝", means: "A company tells everyone how much money it made. It does this 4 times a year.", example: "Disney shares its report card in November.", play: "report" },
  guess: { word: "Grown-ups' guess", emoji: "🔮", means: "Before the report card, experts guess the profit.", example: "They guess $2. That is the number to beat.", play: "report" },
  beat: { word: "Beat", emoji: "👍", means: "The company made more than the grown-ups guessed.", example: "They guessed $2. It made $3. It beat!", play: "report" },
  miss: { word: "Miss", emoji: "👎", means: "The company made less than the grown-ups guessed.", example: "They guessed $2. It made $1. It missed.", play: "report" },
  mood: { word: "Market mood", emoji: "🌦️", means: "How brave or scared people feel about buying shares today.", example: "Sunny means brave. Stormy means scared." },
  saving: { word: "Saving", emoji: "🫙", means: "Keeping money safe so you can use it later.", example: "You put $10 in a jar at the bank. It stays safe.", play: "save:jar" },
  investing: { word: "Investing", emoji: "🌳", means: "Using money to buy a slice of a company so it can grow.", example: "It can grow more than a jar, but it can go down too.", play: "save:tree" },
  interest: { word: "Interest", emoji: "➕", means: "A little extra money the bank pays you for keeping your money there.", example: "Keep $10 in the bank for a year. Get 20 cents extra.", play: "save:jar" },
  dividend: { word: "Dividend", emoji: "🪙", means: "A little of a company's profit, shared with each owner.", example: "Own one slice. Get $1 when the company shares.", play: "dividends:payout" },
  candle: { word: "Candle", emoji: "🕯️", means: "A tiny picture of one day of a price.", example: "A green candle means the price ended higher that day." },
  wick: { word: "Wick", emoji: "📊", means: "The thin line on a candle. It shows the highest and lowest price that day.", example: "A long wick means the price went far, then came back." },
  trend: { word: "Trend", emoji: "🛤️", means: "The way a price is going over many days: up, down or sideways.", example: "Most days end higher, so the trend is up." },
  support: { word: "Support (floor)", emoji: "🪜", means: "A low spot a price keeps bouncing up from.", example: "The price fell to $20 three times and bounced each time." },
  resistance: { word: "Resistance (ceiling)", emoji: "🏠", means: "A high spot a price keeps stopping at.", example: "The price hit $50 twice and turned back down." },
  breakout: { word: "Breakout", emoji: "🚀", means: "When a price pushes up through its ceiling.", example: "The ceiling was $50. Now it is $55. Lots of breakouts fail, too." },
  pattern: { word: "Pattern", emoji: "🕵️", means: "A shape on a chart. It is a clue, not a promise.", example: "Two hills in a row is a pattern. The next day can still surprise you." },
  volume: { word: "Volume", emoji: "🔊", means: "How many shares people traded in a day.", example: "Report card days often have big volume." },
  average: { word: "Moving average", emoji: "〰️", means: "A smooth line made from the middle of the last few prices.", example: "It hides the wiggles, so the trend is easier to see." },
} satisfies Record<string, KidTerm>;
export type KidTermKey = keyof typeof KID_TERMS;

// ── Luna's Lemonade Stand: the "start here" quest. Learn by doing, one idea per stage. ────────
export const QUEST = {
  intro: "Before we look at real companies, let's run our own! Help me run a lemonade stand.",
  company: {
    title: "Run a company",
    ask: "Tap the cup to sell lemonade. Each cup sells for $1. Sell 10 cups!",
    done: "You sold $10 of lemonade. The lemons cost $4. So you have $6 left. That is your profit! Your stand is a company: a team that sells something.",
  },
  shares: {
    title: "Cut it into shares",
    ask: "You want a bigger stand, but you need money. Cut your stand into 4 slices. Tap a friend to sell them a slice for $5.",
    done: "Each slice is called a share. Your friends own a share of your stand now! You got $15 for a bigger stand. Real companies do this too.",
  },
  price: {
    title: "Watch the price move",
    ask: "Now lots of kids want a slice of your stand! Tap the buttons to see what happens to the price.",
    up: "Make the price go up to $8.",
    down: "Now make it go down to $4.",
    done: "More buyers made the price go up. More sellers made it go down. That is how prices move every day!",
  },
  report: {
    title: "Report card day",
    ask: "It's time for your stand's report card! Grown-ups guessed your profit would be $6. Will you beat it or miss it?",
    reveal: "Open the report card",
    result: "Your stand made $7 of profit. That's more than $6, so it BEAT!",
    done: "Real companies like Disney and Apple share a report card 4 times a year. Now you can guess theirs!",
  },
  finish: "You did it! You know what a company, a share, a price and a report card are. You earned the Lemonade Boss badge!",
} as const;
