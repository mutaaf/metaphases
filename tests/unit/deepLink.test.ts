// 0025: a shared link renders what was shared; the "How do you invest?" picker never covers it.
import { describe, expect, it } from "vitest";
import { isDeepLink } from "../../src/lib/deepLink";

describe("isDeepLink (0025)", () => {
  it("treats shared surfaces as deep links", () => {
    expect(isDeepLink("/t/WES", "")).toBe(true);
    expect(isDeepLink("/t/brk.b", "")).toBe(true);
    expect(isDeepLink("/", "?t=QCOM")).toBe(true);
    expect(isDeepLink("/check", "")).toBe(true);
    expect(isDeepLink("/check", "?text=%24UBER")).toBe(true);
    expect(isDeepLink("/today", "")).toBe(true);
    expect(isDeepLink("/w/abc", "")).toBe(true);
  });
  it("treats a shared day drawer (?day=) as a deep link (0065)", () => {
    expect(isDeepLink("/", "?day=2026-11-17")).toBe(true);
    expect(isDeepLink("/", "?day=2026-11-02&utm=x")).toBe(true);
    expect(isDeepLink("/", "?day=")).toBe(false);
    expect(isDeepLink("/", "?day=tuesday")).toBe(false);
    expect(isDeepLink("/", "?day=2026-13-45")).toBe(false);
    expect(isDeepLink("/", "?day=2026-02-30")).toBe(false);
    expect(isDeepLink("/", "?day=2028-02-29")).toBe(true);
    expect(isDeepLink("/compass", "?day=2026-11-17")).toBe(false);
  });
  it("keeps the picker for a plain first visit", () => {
    expect(isDeepLink("/", "")).toBe(false);
    expect(isDeepLink("/", "?utm=x")).toBe(false);
    expect(isDeepLink("/", "?t=")).toBe(false);
    expect(isDeepLink("/compass", "")).toBe(false);
    expect(isDeepLink("/t/", "")).toBe(false);
    // Only what App.tsx actually opens as a sheet counts.
    expect(isDeepLink("/t/123", "")).toBe(false);
    expect(isDeepLink("/t/ABCDEFGHIJK", "")).toBe(false);
  });
});
