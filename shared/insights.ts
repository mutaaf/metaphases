// Box Office analytics (mutaafaziz.com/boxoffice; owner's decision 2026-11-12). The worker appends the
// same-origin loader as the last element of <body> on grown-up pages only, never on the kids area
// (`/kids`, `/kids/*`: Moon Club). The loader honours GPC/DNT, truncates IPs and masks inputs in replays,
// and its relay drops anything whose page is a kids URL; these helpers keep the tag and the events off it too.

export const INSIGHTS_TAG = '<script async src="/boxoffice/v1/insights.js"></script>';

/** A base-relative app path ("/kids/school") belongs to the kids area. */
export const isKidsPath = (p: string) => p === "/kids" || p.startsWith("/kids/");
