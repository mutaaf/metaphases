// Grown-up picks: parent-facing partner links (a kids' money book, a learning account…) in the grown-up corner of
// /kids, behind the parental gate, under a plain disclosure. The Moon Club app has the same slot
// (MoonClubCore Partners.swift). **Off by default: the list ships EMPTY.** Joining an affiliate program and picking
// partners involves money, so it's the owner's call (moon-club docs/LINKS.md, "Affiliate slots").
// Never a partner script, pixel or SDK: a pick is a plain https link with rel="sponsored noopener noreferrer".

export interface Partner {
  id: string;
  /** For a grown-up: "Money Ninja: a picture book about saving". */
  title: string;
  /** One plain sentence on why it's here. Never advice, never hype. */
  blurb: string;
  /** https on the partner's own host. May carry the program's affiliate tag; never anything about the child. */
  url: string;
}

/** EMPTY on purpose. */
export const KIDS_PARTNERS: Partner[] = [];

export const PARTNER_DISCLOSURE = "Grown-ups only. These are partner links: we may earn a fee if you sign up or buy. Nothing here is investment advice, and your child never sees this section.";
export const PARTNER_REL = "sponsored noopener noreferrer";
const BANNED = ["guaranteed", "get rich", "buy now", "hurry", "free money", "you should"];

export function validPartner(p: Partner): boolean {
  let u: URL;
  try { u = new URL(p.url); } catch { return false; }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return false;
  const words = `${p.title} ${p.blurb}`.toLowerCase();
  if (!p.title || !p.blurb || words.includes("http") || words.includes("www.")) return false;
  return !BANNED.some((b) => words.includes(b));
}

export const shownPartners = (list: Partner[] = KIDS_PARTNERS) => list.filter(validPartner);
