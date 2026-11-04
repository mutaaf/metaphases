// Deep links into Moon Club, and App Store campaign credit without tracking (moon-club docs/LINKS.md).
//
// Every URL below is BOTH a real web page under /metaphases/kids and, when Moon Club is installed, a universal
// link that opens the same place in the app (the apple-app-site-association file is served by mutaafaziz-site at
// /.well-known/apple-app-site-association, scoped to these paths). The app's router is MoonClubCore DeepLink.swift;
// keep the two tables in step.
//
// Attribution: a `?ref=<slug>` on any /kids page becomes `ct=<slug>` on the App Store link (App Store Connect
// campaign links, read in App Analytics in aggregate). No cookies, no storage, no SDK, nothing about a child:
// a ref names a channel ("share", "pack-<id>"), it's allow-listed, and anything else is dropped.
import channel from "../packs/channel.json" with { type: "json" };

export interface KidsLink {
  /** Path under /metaphases/kids ("" = the club's front page). `:id` = lesson/pack id, `:code` = league code. */
  path: string;
  /** What the app opens. */
  app: string;
  /** True when it changes a setting: the app (and the web) ask a grown-up first. */
  gated?: boolean;
  /** True when the feature exists only in the app (the web page explains it and points to the app). */
  appOnly?: boolean;
}

/** The URL map. Mirrors MoonClubCore `DeepLink.path`. */
export const KIDS_LINKS: KidsLink[] = [
  { path: "/school", app: "World map" },
  { path: "/school/:id", app: "that lesson (the World map if this build doesn't have it)" },
  { path: "/guess", app: "Guess the Report Card" },
  { path: "/gamenight", app: "Game Night (two players)", appOnly: true },
  { path: "/piggy", app: "Piggy Bank, pretend coins" },
  { path: "/garden", app: "Piggy Bank, Moon Garden", appOnly: true },
  { path: "/ask", app: "Ask Luna" },
  { path: "/league/:code", app: "grown-up gate, then 'add this player to our family league'", gated: true },
  { path: "/pack/:id", app: "grown-up gate, then 'turn on this lesson pack' (bundled packs only)", gated: true, appOnly: true },
];

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const CODE = /^[A-Za-z0-9-]{8,140}$/;
export const isLinkId = (s: string) => ID.test(s);
export const isLeagueLinkCode = (s: string) => CODE.test(s);

/** Lesson packs a link may name: the reviewed ones the app bundles (never a remote pack). */
export const LINK_PACKS: { id: string; title: string; creator: string | null }[] =
  channel.packs.map((p: { id: string; title: string; creator?: string | null }) => ({ id: p.id, title: p.title, creator: p.creator ?? null }));
export const packById = (id: string) => (isLinkId(id) ? LINK_PACKS.find((p) => p.id === id) ?? null : null);

// ── Campaign refs ─────────────────────────────────────────────────────────────────────────────
/** The ct used when a page has no (valid) ref: someone found /kids on their own. */
export const DEFAULT_CT = "kids-web";
/** Channels we credit. Add a slug here before using it in a link; anything else is ignored. */
export const REFS = [
  DEFAULT_CT,
  "share",       // Moon Club → grown-ups → Share (a lesson, the club)
  "league",      // a Family League invite link
  "parent",      // the web grown-up corner's "Share with another parent"
  "worksheet",   // printed worksheets
  "qr",          // a printed QR code
  "newsletter", "instagram", "tiktok", "youtube", "x", "facebook", "reddit", "school",
] as const;
const PACK_REF = /^pack-([a-z0-9][a-z0-9-]{0,34})$/;
/** Apple's campaign token limit. */
export const CT_MAX = 40;

/** An allow-listed ref slug, or null. `pack-<id>` is allowed only for a pack the app ships. */
export function cleanRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (r.length > CT_MAX) return null;
  if ((REFS as readonly string[]).includes(r)) return r;
  const m = r.match(PACK_REF);
  return m && LINK_PACKS.some((p) => p.id === m[1]) ? r : null;
}
export const refFrom = (search: string) => cleanRef(new URLSearchParams(search).get("ref"));

/** The App Store link with campaign credit. Only when we have the provider token; otherwise unchanged. */
export function campaignUrl(appStore: string, providerToken: string | null, ref: string | null): string {
  if (!providerToken || !/^\d{1,12}$/.test(providerToken)) return appStore;
  const ct = cleanRef(ref) ?? DEFAULT_CT;
  return `${appStore}?pt=${providerToken}&ct=${ct}&mt=8`;
}

/** The share URL for a deep link (absolute), with an optional ref. */
export function kidsLinkUrl(origin: string, base: string, path: string, ref?: string | null): string {
  const r = cleanRef(ref ?? null);
  return `${origin}${base}/kids${path}${r ? `?ref=${r}` : ""}`;
}
