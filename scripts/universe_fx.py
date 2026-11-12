"""Market value in US dollars for data/universe.json (0042). Imported by build_universe.py; the vectors
in tests/unit/universeFx.test.ts run these functions with python3.

Finnhub profile2's marketCapitalization is in the currency of the listing it profiles, and its `currency`
label can't be trusted on its own:
  - a US-listed ADR's cap is USD whatever the label (BABA, NTES on NYSE/Nasdaq say "CNY");
  - a foreign listing labelled "USD" is in the exchange's home money (SQM Santiago: pesos; SHEL, BP London: pounds);
  - a foreign listing with a non-USD label is in that currency (TM Tokyo JPY; JD, LI Hong Kong CNY)."""
import datetime, json, time, urllib.request

US_EXCHANGES = ("NASDAQ", "NEW YORK STOCK EXCHANGE", "NYSE MKT", "NYSE ARCA", "NYSE AMERICAN", "CBOE", "BATS", "OTC")
# Matched as substrings of the upper-cased exchange name. Note "NYSE EURONEXT - EURONEXT AMSTERDAM" (ASML) is
# not a US exchange: US_EXCHANGES are matched with startswith and none is a bare "NYSE".
EXCHANGE_HOME = {"TOKYO": "JPY", "TAIWAN": "TWD", "SANTIAGO": "CLP", "COPENHAGEN": "DKK", "EURONEXT": "EUR",
                 "XETRA": "EUR", "HONG KONG": "HKD", "LONDON": "GBP", "SWISS": "CHF", "TORONTO": "CAD"}
MAX_USD_CAP = 10_000_000  # $10T in millions: bigger than any company


def local_cap_currency(p):
    """Currency of profile2's marketCapitalization."""
    ex = (p.get("exchange") or "").upper()
    cur = (p.get("currency") or "USD").upper().replace("RMB", "CNY")
    if any(ex.startswith(u) for u in US_EXCHANGES):
        return "USD"
    if cur == "USD":
        home = next((c for k, c in EXCHANGE_HOME.items() if k in ex), None)
        if home:
            return home
        if ex:
            print("unknown exchange, cap taken as labelled USD:", p.get("ticker"), ex)
    return cur


def usd_rate(cur, fetch=None):
    """(USD per unit of `cur`, date) from Yahoo's daily FX close (an allowed host), or None."""
    def get(host):
        req = urllib.request.Request(f"https://{host}/v8/finance/chart/{cur}USD=X?range=5d&interval=1d", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    fetch = fetch or get
    for attempt, host in enumerate(("query1.finance.yahoo.com", "query2.finance.yahoo.com")):
        try:
            res = fetch(host)["chart"]["result"][0]
            pairs = [(t, c) for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c]
            t, c = pairs[-1]
            return c, datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat()
        except Exception as e:
            print("no fx rate", cur, host, e)
            if attempt == 0:
                time.sleep(2)
    return None


def to_usd(done, rate_of=usd_rate):
    """Set every entry's `mc` to USD millions in place. A converted entry keeps mcL/mcCur and gets fx/fxAt
    (fresh, else its last-known rate). No rate, or an impossible figure, gives mc 0 (shown as "—")."""
    rates = {}
    for sym, c in done.items():
        cur = c.get("mcCur")
        if cur:
            if cur not in rates:
                rates[cur] = rate_of(cur)
            if rates[cur]:
                c["fx"], c["fxAt"] = float(f"{rates[cur][0]:.6g}"), rates[cur][1]
            elif c.get("fx"):
                print("stale fx rate kept", sym, cur, c.get("fxAt"))
            c["mc"] = round(c["mcL"] * c["fx"]) if c.get("fx") and c.get("fxAt") else 0
        if c["mc"] > MAX_USD_CAP:
            print("impossible USD cap, shown as unknown:", sym, c["mc"])
            c["mc"] = 0
    return done
