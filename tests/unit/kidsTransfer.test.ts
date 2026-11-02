import { describe, expect, it } from "vitest";
import { decodeTransfer, encodeTransfer, MAX_GUESSES, TRANSFER_PREFIX, transferChecksum, type TransferState } from "../../shared/kidsTransfer";
import { TRANSFER_SAMPLE } from "../../shared/kidsTransfer.sample";

const empty: TransferState = { guesses: [], piggy: null, lessons: [], lessonDates: {}, seenBadges: [], me: null, league: [], quest: [], questDone: false };

describe("Move my progress codes", () => {
  it("round-trips the sample state", () => {
    const code = encodeTransfer(TRANSFER_SAMPLE);
    expect(code.startsWith(TRANSFER_PREFIX)).toBe(true);
    const r = decodeTransfer(code);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.l).toEqual([["company", "2026-10-10"], ["share", "2026-10-28"]]);
    expect(r.payload.g[0]).toEqual(["DIS", "2026-11-05", "m", "u", "2026-10-30", "", ""]);
    expect(r.payload.p?.h[0]).toEqual(["DIS", 400, 4, 100]);
    expect(r.payload.lg[0]).toMatch(/^MOON-/);
    expect(r.payload.qd).toBe(1);
  });

  it("is found inside pasted text and survives line breaks", () => {
    const code = encodeTransfer(TRANSFER_SAMPLE);
    const pasted = `here you go:\n${code.slice(0, 40)}\n${code.slice(40)}  thanks!`;
    expect(decodeTransfer(pasted.replace(" thanks!", "")).ok).toBe(true);
  });

  it("rejects text that isn't a code, and catches a changed letter", () => {
    expect(decodeTransfer("hello")).toEqual({ ok: false, why: "notACode" });
    const code = encodeTransfer(TRANSFER_SAMPLE);
    const i = TRANSFER_PREFIX.length + 10;
    const bad = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
    expect(decodeTransfer(bad)).toEqual({ ok: false, why: "damaged" });
  });

  it("carries no free text: only ids, days, picks and numbers", () => {
    const code = encodeTransfer(TRANSFER_SAMPLE);
    const r = decodeTransfer(code);
    if (!r.ok) throw new Error("decode");
    expect(Object.keys(r.payload).sort()).toEqual(["b", "g", "l", "lg", "me", "p", "q", "qd", "v"]);
  });

  it("stays small: at most 200 guesses and 60 piggy days", () => {
    const many: TransferState = {
      ...empty,
      guesses: Array.from({ length: 500 }, (_, i) => ({ s: "DIS", d: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}x${i}`, pick: "beat" as const, at: "2026-01-01" })),
      piggy: { started: "2026-01-01", holdings: [], history: Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}`, 1000 + i])) },
    };
    const r = decodeTransfer(encodeTransfer(many));
    if (!r.ok) throw new Error("decode");
    expect(r.payload.g.length).toBe(MAX_GUESSES);
    expect(r.payload.p?.hi.length).toBe(60);
    expect(encodeTransfer(many).length).toBeLessThan(30000);
  });

  it("checksum is 4 Crockford characters", () => {
    expect(transferChecksum("abc")).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});
