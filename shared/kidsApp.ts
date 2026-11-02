// Moon Club, the native iPhone + iPad app (mutaaf/moon-club). The website leads here.
// The TestFlight public link exists only after Apple's Beta App Review approves the external group
// ("Nephew Squad"). Until then it's null and the page says the beta opens soon. Set it in one place.
export const MOON_CLUB_APP = {
  name: "Moon Club",
  /** e.g. "https://testflight.apple.com/join/AbCd1234". Null until Beta App Review approves the public link. */
  testflight: null as string | null,
  /** The App Store listing, once Moon Club is released publicly (after the COPPA review). */
  appStore: null as string | null,
};

/** Only Apple's own hosts may be linked, and only from behind the parental gate (kids rules). */
export const isAppleAppLink = (u: string | null): u is string =>
  !!u && /^https:\/\/(testflight\.apple\.com\/join\/[A-Za-z0-9]+|apps\.apple\.com\/[a-z]{2}\/app\/[a-z0-9-]+\/id\d+)$/.test(u);

export const appLink = () => (isAppleAppLink(MOON_CLUB_APP.appStore) ? { kind: "store" as const, url: MOON_CLUB_APP.appStore }
  : isAppleAppLink(MOON_CLUB_APP.testflight) ? { kind: "beta" as const, url: MOON_CLUB_APP.testflight } : null);
