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
});
