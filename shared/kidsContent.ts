// Moon School lessons and kid words for Metaphases Kids. Written for a 9-year-old (grade 3–4):
// short sentences, everyday words, one idea per lesson. A unit test keeps every lesson at a
// Flesch–Kincaid grade of 5 or below — if you edit, keep it simple.

// Moon School is a set of MICRO-LESSONS (about a minute each), grouped into units. Each lesson is
// a few tiny steps: one emoji + one short sentence per card, with a quick check or a sorting game
// in between. `screens` and `quiz` are derived for the worksheets and the quiz of the day.
//
// The curriculum itself lives in the Core LESSON PACK (packs/core/pack.json, format: shared/kidsPacks.ts),
// written with and signed off by our two expert reviewers (packs/core/reviews/). Edit the JSON, not this file.
import core from "../packs/core/pack.json" with { type: "json" };
import type { LessonPack, Quiz, SortItem, Step } from "./kidsPacks";
export type { Quiz, SortItem, Step };
export interface Unit { id: string; title: string; emoji: string; blurb: string; track?: string }
export interface Lesson { id: string; unit: string; title: string; emoji: string; track?: string; objectives?: string[]; steps: Step[]; screens: string[]; quiz: Quiz[] }

export const CORE_PACK = core as unknown as LessonPack;
export const UNITS: Unit[] = CORE_PACK.units.map(({ id, title, emoji, blurb, track }) => ({ id, title, emoji, blurb, track }));
export const LESSONS: Lesson[] = CORE_PACK.units.flatMap((u) => u.lessons.map((l) => ({
  id: l.id, unit: u.id, title: l.title, emoji: l.emoji, track: l.track, objectives: l.objectives, steps: l.steps,
  screens: l.steps.flatMap((x) => (x.t === "say" ? [x.text] : [])),
  quiz: l.steps.flatMap((x) => (x.t === "check" ? [{ q: x.q, options: x.options, answer: x.answer, why: x.why }] : [])),
})));
export const lessonUnit = (l: Lesson) => UNITS.find((u) => u.id === l.unit)!;

export interface KidWord { word: string; means: string; example: string }
export const KID_WORDS: KidWord[] = CORE_PACK.words;

// ── Tap-a-word: picture cards for every word a kid meets on a card (the pack's glossary) ──
export type QuestStage = "company" | "shares" | "price" | "report";
/** Where "Play it" jumps: a lemonade stage, or a later chapter's stage ("save:jar", "dividends:payout"). */
export type QuestPlay = QuestStage | `save:${string}` | `dividends:${string}`;
export interface KidTerm { word: string; emoji: string; means: string; example: string; play?: QuestPlay }
export type KidTermKey = keyof typeof core.glossary;
export const KID_TERMS = CORE_PACK.glossary as Record<KidTermKey, KidTerm>;

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
