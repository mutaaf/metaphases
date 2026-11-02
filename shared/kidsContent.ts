// Moon School lessons and kid words for Metaphases Kids. Written for a 9-year-old (grade 3–4):
// short sentences, everyday words, one idea per lesson. A unit test keeps every lesson at a
// Flesch–Kincaid grade of 5 or below — if you edit, keep it simple.

export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface Lesson { id: string; title: string; emoji: string; screens: string[]; quiz: Quiz[] }

export const LESSONS: Lesson[] = [
  {
    id: "company", title: "What is a company?", emoji: "🏪",
    screens: [
      "A company is a group of people who work together to sell something.",
      "Some sell things you can hold, like shoes or toys. Some sell things you use, like games or videos.",
      "When people buy what a company sells, the company gets money. If it gets more than it spends, that extra is called profit.",
    ],
    quiz: [
      { q: "What does a company do?", options: ["Sells things or services", "Only plays games", "Makes the weather"], answer: 0, why: "A company sells things or services to people." },
      { q: "Profit is…", options: ["Money left after paying the bills", "A kind of fruit", "All the money a company spends"], answer: 0, why: "Profit is the money left over after the company pays for everything." },
    ],
  },
  {
    id: "share", title: "What is a share?", emoji: "🍕",
    screens: [
      "Think of a big company like a pizza cut into lots and lots of slices.",
      "Each slice is called a share. If you own a share, you own a tiny piece of that company.",
      "People can buy and sell shares in a place called the stock market. Grown-ups need a special account to do it.",
    ],
    quiz: [
      { q: "If you own a share of a company, you own…", options: ["A tiny piece of it", "The whole company", "One of its stores"], answer: 0, why: "A share is a tiny slice of the whole company, like one slice of a pizza." },
      { q: "Where do people buy and sell shares?", options: ["The stock market", "The toy store", "The bank vault"], answer: 0, why: "Shares are bought and sold on the stock market." },
    ],
  },
  {
    id: "prices", title: "Why do prices go up and down?", emoji: "🎢",
    screens: [
      "The price of a share is what someone will pay for it right now.",
      "When lots of people want to buy, the price goes up. When lots of people want to sell, the price goes down.",
      "It is a bit like trading cards. When everyone wants a card, people will give more for it.",
      "Prices move every day. Small ups and downs are normal.",
    ],
    quiz: [
      { q: "If lots of people want to buy a share, the price…", options: ["Goes up", "Goes down", "Stays stuck"], answer: 0, why: "More buyers than sellers pushes the price up." },
      { q: "Is it normal for prices to move a little every day?", options: ["Yes", "No, never"], answer: 0, why: "Prices wiggle every day. That is normal." },
    ],
  },
  {
    id: "report-card", title: "What is a report card?", emoji: "📝",
    screens: [
      "You get a report card from school. Companies get one too!",
      "Four times a year, each company tells everyone how it did. Grown-ups call this an earnings report.",
      "It says how much money came in, and how much profit the company made.",
      "Metaphases shows when each company will share its report card. We draw the time as a moon.",
    ],
    quiz: [
      { q: "How many times a year does a company share its report card?", options: ["4 times", "Once", "Every day"], answer: 0, why: "Companies report four times a year, once every three months." },
      { q: "What do grown-ups call a company's report card?", options: ["An earnings report", "A gift card", "A birthday card"], answer: 0, why: "It is called an earnings report." },
    ],
  },
  {
    id: "beat", title: "What does \"beat\" mean?", emoji: "🎯",
    screens: [
      "Before a report card comes out, grown-ups make a guess. They guess how much profit the company will make.",
      "If the company makes more than the guess, it beat. If it makes less, it missed.",
      "Sometimes a company beats and the price still goes down. People may have hoped for even more!",
    ],
    quiz: [
      { q: "Grown-ups guessed $2. The company made $3. Did it beat or miss?", options: ["Beat", "Miss"], answer: 0, why: "$3 is more than the $2 guess, so it beat." },
      { q: "Can a price go down even when a company beats?", options: ["Yes, sometimes", "No, never"], answer: 0, why: "Yes! People may have hoped for even more good news." },
    ],
  },
  {
    id: "saving", title: "Saving vs investing", emoji: "🐷",
    screens: [
      "Saving is keeping your money safe, like in a piggy bank. It stays the same.",
      "Investing is using money to buy things like shares. It can grow, but it can also shrink.",
      "Grown-ups often do both. They save money they need soon. They invest money they will not need for a long time.",
    ],
    quiz: [
      { q: "Money in a piggy bank…", options: ["Stays the same", "Grows by itself", "Turns into shares"], answer: 0, why: "Saved money stays the same. It does not grow or shrink." },
      { q: "Investing can make money…", options: ["Grow or shrink", "Only grow", "Disappear for sure"], answer: 0, why: "Investing can go up or down. That is the risk." },
    ],
  },
  {
    id: "baskets", title: "Don't put all your eggs in one basket", emoji: "🧺",
    screens: [
      "Imagine you carry all your eggs in one basket. If you trip, they all break!",
      "If you split them into many baskets, one trip only breaks a few.",
      "Money works the same way. Owning a little of many companies is safer than owning a lot of one.",
      "Grown-ups call this spreading out. You can try it in your Piggy Bank.",
    ],
    quiz: [
      { q: "Why split your eggs into many baskets?", options: ["So one trip doesn't break them all", "Baskets are pretty", "Eggs like company"], answer: 0, why: "If one basket falls, the others are still safe." },
      { q: "Which is safer?", options: ["A little of many companies", "All your money in one company"], answer: 0, why: "Spreading out means one bad day hurts less." },
    ],
  },
  {
    id: "patience", title: "Be patient like the moon", emoji: "🌙",
    screens: [
      "The moon takes about a month to go from new moon to full moon. It does not rush.",
      "Good companies can grow over many years. Some days their price goes down. Some days it goes up.",
      "People who wait a long time often do better than people who buy and sell every day.",
    ],
    quiz: [
      { q: "Good investing is usually…", options: ["Slow and patient", "Fast and wild", "Done every minute"], answer: 0, why: "Being patient over many years usually works better." },
      { q: "If a price goes down for one day, should you panic?", options: ["No, small drops are normal", "Yes, always"], answer: 0, why: "Prices go up and down. One bad day is normal." },
    ],
  },
  {
    id: "hype", title: "Hype vs facts", emoji: "📣",
    screens: [
      "Sometimes a video says a stock will go to the moon. That is called hype.",
      "Hype is exciting. But the person in the video might be trying to sell, or might just be wrong.",
      "Facts are things you can check, like how much profit a company made.",
      "Before you believe a video, ask: What are the facts? Who is telling me this? Why?",
    ],
    quiz: [
      { q: "A video says \"this stock will go to the moon!\" That is…", options: ["Hype", "A fact", "A school rule"], answer: 0, why: "It's an exciting guess, not a fact you can check." },
      { q: "What should you do before believing a video?", options: ["Check the facts", "Tell everyone right away", "Buy right now"], answer: 0, why: "Always check the facts, and ask a grown-up." },
    ],
  },
];

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
