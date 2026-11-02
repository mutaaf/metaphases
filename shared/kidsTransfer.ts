// "Move my progress" (web → the Moon Club iPhone/iPad app). A grown-up copies this code from the
// grown-up corner and pastes it into the app's grown-up corner; the app merges it into its progress.
// Nothing is uploaded: the code IS the progress, moved by hand. It holds only lesson ids and dates,
// quest stages, badges, guesses (company, day, pick), the pretend piggy bank and Family League codes,
// never a name or anything a child typed. Swift twin: moon-club MoonClubCore/Transfer.swift, kept in
// step by the `transfer` vectors in `npm run export:kids`.
import type { Guess, PiggyHolding } from "./kids";
import { encodeLeague, type LeaguePlayer } from "./kidsWeek";

export const TRANSFER_PREFIX = "MOONP1-";
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const MAX_GUESSES = 200;
export const MAX_HISTORY = 60;

export interface TransferState {
  guesses: Guess[];
  piggy: { started: string; holdings: PiggyHolding[]; history: Record<string, number> } | null;
  lessons: string[]; lessonDates: Record<string, string>; seenBadges: string[];
  me: number | null; league: LeaguePlayer[]; quest: string[]; questDone: boolean;
}

/** FNV-1a 32-bit over the body's UTF-8, folded to 20 bits → 4 Crockford characters. */
export function transferChecksum(body: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(body)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  const v = (h ^ (h >>> 20)) & 0xfffff;
  return [15, 10, 5, 0].map((s) => B32[(v >> s) & 31]).join("");
}

const b64url = (s: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const res = (o?: "right" | "wrong") => (o === "right" ? "r" : o === "wrong" ? "w" : "");

/** The compact payload (arrays and one-letter values): the format both sides read. */
export function transferPayload(st: TransferState) {
  const guesses = [...st.guesses].sort((a, b) => b.d.localeCompare(a.d) || a.s.localeCompare(b.s)).slice(0, MAX_GUESSES);
  return {
    v: 1,
    l: st.lessons.map((id) => [id, st.lessonDates[id] ?? ""]),
    q: st.quest,
    qd: st.questDone ? 1 : 0,
    b: st.seenBadges,
    me: st.me,
    lg: st.league.map((p) => encodeLeague(p)),
    g: guesses.map((g) => [g.s, g.d, g.pick === "miss" ? "m" : "b", g.price === "up" ? "u" : g.price === "down" ? "d" : "", g.at, res(g.result), res(g.priceResult)]),
    p: st.piggy && {
      st: st.piggy.started,
      h: st.piggy.holdings.map((h) => [h.s, h.coins, h.shares, h.start]),
      hi: Object.entries(st.piggy.history).sort(([a], [b]) => a.localeCompare(b)).slice(-MAX_HISTORY),
    },
  };
}
export type TransferPayload = ReturnType<typeof transferPayload>;

export function encodeTransfer(st: TransferState): string {
  const body = b64url(JSON.stringify(transferPayload(st)));
  return TRANSFER_PREFIX + body + "-" + transferChecksum(body);
}

export type TransferResult = { ok: true; payload: TransferPayload } | { ok: false; why: "notACode" | "damaged" | "tooBig" };
/** Finds and checks a code anywhere in pasted text. Used by tests and the "check before you copy" round trip. */
export function decodeTransfer(raw: string): TransferResult {
  const text = raw.replace(/\s/g, "");
  if (text.length > 60000) return { ok: false, why: "tooBig" };
  const i = text.toUpperCase().indexOf(TRANSFER_PREFIX);
  if (i < 0) return { ok: false, why: "notACode" };
  const rest = text.slice(i + TRANSFER_PREFIX.length);
  const dash = rest.lastIndexOf("-");
  if (dash < 0) return { ok: false, why: "damaged" };
  const body = rest.slice(0, dash), sum = rest.slice(dash + 1, dash + 5).toUpperCase();
  if (transferChecksum(body) !== sum) return { ok: false, why: "damaged" };
  try {
    const payload = JSON.parse(unb64url(body));
    return payload?.v === 1 ? { ok: true, payload } : { ok: false, why: "damaged" };
  } catch { return { ok: false, why: "damaged" }; }
}
