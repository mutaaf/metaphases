// Lesson packs: the JSON Schema, the kids-rules validator, composition and the signed remote channel.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import Ajv2020 from "ajv/dist/2020";
import schema from "../../packs/pack.schema.json" with { type: "json" };
import core from "../../packs/core/pack.json" with { type: "json" };
import channel from "../../packs/channel.json" with { type: "json" };
import { channelReady, composePacks, lessonGrade, packGlyphs, packTexts, validatePack, type LessonPack } from "../../shared/kidsPacks";
import { fkGrade } from "../../shared/kids";

const CORE = core as unknown as LessonPack;
const all = readdirSync("packs", { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`packs/${d.name}/pack.json`))
  .map((d) => ({ dir: d.name, pack: JSON.parse(readFileSync(`packs/${d.name}/pack.json`, "utf8")) as LessonPack }));
const guests = all.filter((p) => p.pack.kind !== "core");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("lesson pack format", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const check = ajv.compile(schema);
  it.each(all.map((p) => [p.dir, p.pack] as const))("%s matches the JSON Schema", (_, p) => {
    expect(check(p), JSON.stringify(check.errors?.slice(0, 3))).toBe(true);
  });
  it("lives in a folder named after its id, with expert reviews beside it", () => {
    for (const { dir, pack } of all) {
      expect(pack.id).toBe(dir);
      for (const who of ["rivera", "okafor"]) expect(existsSync(`packs/${dir}/reviews/${who}.md`), `${dir}/reviews/${who}.md`).toBe(true);
    }
  });
  it("the schema rejects a malformed pack", () => {
    const bad: any = clone(CORE); bad.units[0].lessons[0].steps[0] = { t: "dance", text: "hi" };
    expect(check(bad)).toBe(false);
  });
});

describe("kids rules on every pack", () => {
  it.each(all.map((p) => [p.dir, p.pack] as const))("%s passes the validator (reading level, glyphs, links, advice, ids)", (_, p) => {
    expect(validatePack(p, p.kind === "core" ? undefined : CORE)).toEqual([]);
  });
  it("every lesson reads at grade 5 or below, every card is short", () => {
    for (const { pack } of all) for (const u of pack.units) for (const l of u.lessons) {
      const g = lessonGrade(l);
      expect(g.say, l.id).toBeLessThanOrEqual(5);
      expect(g.all, l.id).toBeLessThanOrEqual(5.5);
    }
  });
  it("the readability gate really flags grown-up prose", () => {
    const p = clone(CORE); p.units[0].lessons[0].steps[1] = { t: "say", emoji: "🤔", text: "Consensus estimates incorporate analysts' expectations regarding quarterly profitability." };
    expect(validatePack(p).map((i) => i.code)).toContain("readability");
  });
  it("links, handles and promotion are caught; quoted hype and wrong answers are allowed", () => {
    const g = clone(guests[0].pack);
    g.units[0].lessons[0].steps[0] = { t: "say", emoji: "🚀", text: "Find me at www.example.org and follow me!" };
    const codes = validatePack(g, CORE).map((i) => i.code);
    expect(codes).toContain("link");
    expect(codes).toContain("banned");
    const ok = clone(guests[0].pack);
    ok.units[0].lessons[0].steps[0] = { t: "say", emoji: "🚀", text: "A video says \"buy now\". That is hype, not a fact." };
    expect(validatePack(ok, CORE)).toEqual([]);
  });
  it("declares every glyph it draws (the app checks each one has art)", () => {
    for (const { pack } of all) expect(new Set(pack.glyphs)).toEqual(new Set(packGlyphs(pack)));
  });
  it("no kid copy anywhere tells anyone to buy or sell, or links out", () => {
    for (const { pack } of all) for (const t of packTexts(pack)) {
      if (!t.distractor) expect(t.text, t.at).not.toMatch(/\byou should (buy|sell)\b|buy now|sign up|download/i);
      expect(t.text, t.at).not.toMatch(/https?:\/\/|www\./i);
    }
  });
  it("glossary and words stay simple", () => {
    for (const { pack } of all) expect(fkGrade([...Object.values(pack.glossary).map((t) => `${t.means} ${t.example}`), ...pack.words.map((w) => `${w.means} ${w.example}`)].join(" "))).toBeLessThanOrEqual(5);
  });
});

describe("Core curriculum", () => {
  const lessons = CORE.units.flatMap((u) => u.lessons);
  it("covers the overhaul scope with two tracks", () => {
    for (const id of ["money", "choose", "company", "share", "prices", "piggy-spread", "piggy-peek", "saving", "risk", "snowball", "dividend", "div-day", "baskets", "patience", "report-card", "guess", "beat", "expectations", "guidance", "why-market", "why-group", "why-wiggle", "why-unsure", "candle", "trend", "floor-ceiling", "breakout", "volume", "moving-average", "clues"]) expect(lessons.some((l) => l.id === id), id).toBe(true);
    expect(new Set(lessons.map((l) => l.track))).toEqual(new Set(["6-8", "9-11"]));
    for (const l of lessons) expect(l.objectives?.length, l.id).toBeGreaterThan(0);
  });
  it("Guess and Piggy courses walk through real lessons in order", () => {
    expect(CORE.guess!.ladder).toEqual(["report-card", "guess", "beat", "after", "expectations", "guidance"]);
    expect(CORE.piggy!.ladder[0]).toBe("piggy-start");
    for (const id of [...CORE.guess!.ladder, ...CORE.piggy!.ladder]) expect(lessons.some((l) => l.id === id), id).toBe(true);
  });
  it("every region has a review stop before its boss", () => {
    for (const r of CORE.regions) {
      expect(r.nodes.at(-2)?.kind, r.id).toBe("practice");
      expect(["review", "timeMachine"]).toContain(r.nodes.at(-1)?.kind);
    }
  });
  it("is signed off by both experts (a human signs before any remote channel)", () => {
    for (const role of ["teacher", "markets"]) expect(CORE.reviewers.some((r) => r.role === role && r.signedOff), role).toBe(true);
  });
});

describe("composition and the signed channel", () => {
  it("extend packs add units, words and a region next to Core", () => {
    const c = composePacks(CORE, guests.map((g) => g.pack));
    expect(c.units.length).toBe(CORE.units.length + guests.reduce((a, g) => a + g.pack.units.length, 0));
    expect(c.regions.map((r) => r.id)).toContain("nova-cove");
    expect(c.glossary.share).toBeTruthy();
  });
  it("a replace pack swaps the course", () => {
    const rep = clone(guests[0].pack); rep.kind = "replace";
    const c = composePacks(CORE, [rep]);
    expect(c.units.map((u) => u.id)).toEqual(rep.units.map((u) => u.id));
    expect(c.regions.map((r) => r.id)).toEqual(["nova-cove"]);
  });
  it("extend packs may not shadow Core ids", () => {
    const g = clone(guests[0].pack); g.units[0].lessons[0].id = "money";
    expect(validatePack(g, CORE).map((i) => i.code)).toContain("collide");
  });
  it("every channel signature verifies over the exact bytes the worker serves (re-run npm run packs:sign after edits)", () => {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(channel.publicKey, "base64").toString("base64url") }, format: "jwk" });
    for (const g of guests) {
      const e = channel.packs.find((x) => x.id === g.pack.id);
      expect(e, g.pack.id).toBeTruthy();
      expect(verify(null, Buffer.from(JSON.stringify(g.pack), "utf8"), key, Buffer.from(e!.sig, "base64")), g.pack.id).toBe(true);
      expect(e!.ready).toBe(channelReady(g.pack));
    }
  });
  it("nothing reaches the channel without a human sign-off", () => {
    for (const g of guests) if (!g.pack.reviewers.some((r) => r.role === "human" && r.signedOff)) expect(channelReady(g.pack)).toBe(false);
  });
});
