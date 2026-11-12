import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY } from "../../src/lib/glossary";

// 0051: an empty trading day only means none of the companies we follow
// report. Big untracked reporters (Japan's megabanks on Nov 13) do, so the UI
// never states "No earnings" as a fact.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("0051 empty-day copy", () => {
  it("no surface says \"No earnings\" or \"nothing reports\"", () => {
    const hits = files("src").filter((f) => /No earnings|nothing reports/i.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });

  it("explains what \"companies we follow\" means", () => {
    const g = GLOSSARY.follow;
    expect(g?.term).toMatch(/follow/i);
    expect(g?.def).toMatch(/S&P 500/);
    expect(g?.def).toMatch(/aren't included|not included/);
  });
});
