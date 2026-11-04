// Moon Club, the native iPhone + iPad app (mutaaf/moon-club). The website leads here.
// The TestFlight public link exists only after Apple's Beta App Review approves the external group
// ("Nephew Squad"). Until then it's null and the page says the beta opens soon. Set it in one place.
import { campaignUrl } from "./kidsLinks";

export const MOON_CLUB_APP = {
  name: "Moon Club",
  /** e.g. "https://testflight.apple.com/join/AbCd1234". Null until Beta App Review approves the public link. */
  testflight: "https://testflight.apple.com/join/yW7rzq7P" as string | null,
  /** The App Store listing, once Moon Club is released: "https://apps.apple.com/us/app/moon-club/id6829860949"
   *  (check the slug on the live listing). Null while the first version is in review. */
  appStore: null as string | null,
  /** App Store Connect "provider token" (pt=, digits): App Analytics → Acquisition → Campaigns → Generate a
   *  campaign link, copy the pt value (moon-club docs/LINKS.md). Null = links carry no campaign credit. */
  providerToken: null as string | null,
};

/** Only Apple's own hosts may be linked, and only from behind the parental gate (kids rules). App Store links may
 *  carry campaign credit, in exactly this shape: ?pt=<digits>&ct=<slug>&mt=8 (nothing about a child fits in it). */
export const isAppleAppLink = (u: string | null): u is string =>
  !!u && /^https:\/\/(testflight\.apple\.com\/join\/[A-Za-z0-9]+|apps\.apple\.com\/[a-z]{2}\/app\/[a-z0-9-]+\/id\d+(\?pt=\d{1,12}&ct=[a-z0-9-]{1,40}&mt=8)?)$/.test(u);

/** The download link for a grown-up. `ref` (an allow-listed slug from ?ref=) becomes the App Store campaign token. */
export const appLink = (ref: string | null = null) => {
  const store = isAppleAppLink(MOON_CLUB_APP.appStore) ? campaignUrl(MOON_CLUB_APP.appStore, MOON_CLUB_APP.providerToken, ref) : null;
  return store && isAppleAppLink(store) ? { kind: "store" as const, url: store }
    : isAppleAppLink(MOON_CLUB_APP.testflight) ? { kind: "beta" as const, url: MOON_CLUB_APP.testflight } : null;
};
