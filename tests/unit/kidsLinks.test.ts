import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { campaignUrl, cleanRef, CT_MAX, DEFAULT_CT, KIDS_LINKS, kidsLinkUrl, LINK_PACKS, packById, REFS, refFrom, isLeagueLinkCode, isLinkId } from "../../shared/kidsLinks";
import { KIDS_PARTNERS, PARTNER_DISCLOSURE, PARTNER_REL, shownPartners, validPartner } from "../../shared/kidsPartners";
import { appLink, isAppleAppLink, MOON_CLUB_APP } from "../../shared/kidsApp";

describe("Moon Club deep links", () => {
  it("every deep link is a /kids page the web app routes (not the Story fallback)", () => {
    const src = readFileSync("src/pages/Kids.tsx", "utf8");
    for (const l of KIDS_LINKS) {
      const head = l.path.split("/")[1];
      expect(src, l.path).toMatch(new RegExp(`kids\\\\?/${head}`));
    }
  });

  it("mirrors the app's router (MoonClubCore DeepLink.path)", () => {
    expect(KIDS_LINKS.map((l) => l.path)).toEqual(["/school", "/school/:id", "/guess", "/gamenight", "/piggy", "/garden", "/ask", "/league/:code", "/pack/:id"]);
    expect(KIDS_LINKS.filter((l) => l.gated).map((l) => l.path)).toEqual(["/league/:code", "/pack/:id"]);
  });

  it("checks ids and codes", () => {
    expect(isLinkId("tug-of-war")).toBe(true);
    expect(isLinkId("Money")).toBe(false);
    expect(isLinkId("-x")).toBe(false);
    expect(isLinkId("a".repeat(49))).toBe(false);
    expect(isLeagueLinkCode("MOON-1A2B-C3D4")).toBe(true);
    expect(isLeagueLinkCode("short")).toBe(false);
    expect(isLeagueLinkCode("MOON_1A2B<script>")).toBe(false);
  });

  it("names only packs the app ships, never a remote one", () => {
    expect(LINK_PACKS.map((p) => p.id)).toContain("guest-coach-nova");
    expect(packById("guest-coach-nova")?.title).toBe("Coach Nova's Maker Lab");
    expect(packById("no-such-pack")).toBeNull();
    expect(packById("../core")).toBeNull();
  });
});

describe("campaign refs (App Store ct=)", () => {
  it("keeps only allow-listed slugs", () => {
    for (const r of REFS) { expect(cleanRef(r)).toBe(r); expect(r.length).toBeLessThanOrEqual(CT_MAX); }
    expect(cleanRef("SHARE")).toBe("share");
    expect(cleanRef("pack-guest-coach-nova")).toBe("pack-guest-coach-nova");
    for (const bad of ["pack-unknown", "kid@example.com", "emma", "share;drop", "", null, undefined, "a".repeat(41)]) expect(cleanRef(bad as string)).toBeNull();
    expect(refFrom("?ref=share&x=1")).toBe("share");
    expect(refFrom("?ref=Emma")).toBeNull();
  });

  it("adds pt/ct/mt only with a provider token, and the result passes the Apple link check", () => {
    const base = "https://apps.apple.com/us/app/moon-club/id6829860949";
    expect(campaignUrl(base, null, "share")).toBe(base);
    expect(campaignUrl(base, "12345678", "share")).toBe(`${base}?pt=12345678&ct=share&mt=8`);
    expect(campaignUrl(base, "12345678", "emma")).toBe(`${base}?pt=12345678&ct=${DEFAULT_CT}&mt=8`);
    expect(campaignUrl(base, "not-digits", "share")).toBe(base);
    expect(isAppleAppLink(campaignUrl(base, "12345678", "pack-guest-coach-nova"))).toBe(true);
  });

  it("the live download link is still a plain Apple link", () => {
    const l = appLink("share");
    if (l) expect(isAppleAppLink(l.url)).toBe(true);
    if (!MOON_CLUB_APP.appStore) expect(l?.kind ?? "beta").toBe("beta");
  });

  it("builds share URLs", () => {
    expect(kidsLinkUrl("https://mutaafaziz.com", "/metaphases", "/school/money", "share")).toBe("https://mutaafaziz.com/metaphases/kids/school/money?ref=share");
    expect(kidsLinkUrl("https://mutaafaziz.com", "/metaphases", "/guess", "Emma")).toBe("https://mutaafaziz.com/metaphases/kids/guess");
  });
});

describe("grown-up picks (affiliate slot)", () => {
  it("ships empty: partners are the owner's call", () => {
    expect(KIDS_PARTNERS).toEqual([]);
    expect(shownPartners()).toEqual([]);
  });
  it("discloses, marks links sponsored, and draws only safe links", () => {
    expect(PARTNER_DISCLOSURE).toContain("we may earn a fee");
    expect(PARTNER_REL.split(" ")).toEqual(expect.arrayContaining(["sponsored", "noopener"]));
    const ok = { id: "b", title: "A picture book about saving", blurb: "A bedtime story about a jar and a goal.", url: "https://example.com/book?tag=x-20" };
    expect(validPartner(ok)).toBe(true);
    expect(validPartner({ ...ok, url: "http://example.com" })).toBe(false);
    expect(validPartner({ ...ok, url: "javascript:alert(1)" })).toBe(false);
    expect(validPartner({ ...ok, title: "Get rich" })).toBe(false);
    expect(validPartner({ ...ok, blurb: "see www.x.com" })).toBe(false);
    expect(shownPartners([ok, { ...ok, url: "ftp://x.y" }])).toEqual([ok]);
  });
});
