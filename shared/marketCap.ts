/**
 * The sheet's market value (0042). A tracked company's is the universe's USD figure in millions (0 = unknown
 * → null): Finnhub's profile cap is in the profiled listing's currency and its label can be wrong (SQM "USD"
 * for 15.1T pesos, Shell "USD" for pounds, BABA "CNY" for a dollar figure). Untracked names keep the profile's.
 */
export function profileCap(
  u: { mc: number } | undefined,
  profile: { marketCapitalization?: number; currency?: unknown },
): { marketCap: number | null; currency: string } {
  if (u) return { marketCap: u.mc > 0 ? u.mc : null, currency: "USD" };
  return { marketCap: profile.marketCapitalization ?? null, currency: typeof profile.currency === "string" ? profile.currency : "USD" };
}
