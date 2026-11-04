import { describe, expect, it } from "vitest";
import { isAppleAppLink } from "../../shared/kidsApp";

describe("Moon Club app links", () => {
  it("accepts only Apple's TestFlight and App Store links", () => {
    expect(isAppleAppLink("https://testflight.apple.com/join/AbCd1234")).toBe(true);
    expect(isAppleAppLink("https://apps.apple.com/us/app/moon-club/id1234567890")).toBe(true);
    expect(isAppleAppLink("https://testflight.apple.com.evil.com/join/x")).toBe(false);
    expect(isAppleAppLink("http://testflight.apple.com/join/AbCd1234")).toBe(false);
    expect(isAppleAppLink("https://example.com")).toBe(false);
    expect(isAppleAppLink(null)).toBe(false);
  });

  it("allows App Store campaign credit in exactly one safe shape", () => {
    const base = "https://apps.apple.com/us/app/moon-club/id6829860949";
    expect(isAppleAppLink(`${base}?pt=123456&ct=kids-web&mt=8`)).toBe(true);
    expect(isAppleAppLink(`${base}?pt=123456&ct=pack-guest-coach-nova&mt=8`)).toBe(true);
    for (const bad of [
      `${base}?pt=abc&ct=kids-web&mt=8`,            // pt is digits
      `${base}?pt=123456&ct=Kid%20Name&mt=8`,       // no free text
      `${base}?pt=123456&ct=${"a".repeat(41)}&mt=8`, // Apple's 40-char limit
      `${base}?ct=kids-web&pt=123456&mt=8`,          // fixed order
      `${base}?pt=123456&ct=kids-web&mt=8&uid=42`,   // nothing extra
      `${base}?pt=123456&ct=kids-web`,
      "https://testflight.apple.com/join/AbCd1234?ct=share", // TestFlight has no campaigns
    ]) expect(isAppleAppLink(bad), bad).toBe(false);
  });
});
