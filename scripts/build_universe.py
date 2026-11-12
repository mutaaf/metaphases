"""Build data/universe.json: the tickers Metaphases tracks, with name/logo/sector/market cap.
Usage: FINNHUB_API_KEY=... python3 scripts/build_universe.py [--fresh]   (≈11 min at the free 60/min limit)
  --fresh  re-download the S&P 500 list and refetch every profile (weekly job); otherwise resumes."""
import sys
import csv, json, os, time, urllib.request, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = os.environ["FINNHUB_API_KEY"]
EXTRA = """PLTR SOFI HOOD RIVN LCID NIO BABA BIDU JD PDD SHOP SE MELI COIN RBLX U SNOW NET DDOG ZS MDB ROKU SPOT
PYPL AFRM UPST DKNG CHWY ETSY W ZM DOCU TWLO OKTA PINS SNAP LYFT ABNB DASH RDDT ARM SMCI MSTR CELH ELF CAVA DUOL
ONON BIRK CART TOST PATH AI IONQ RKLB ASTS SOUN NU TSM ASML SONY TM NVO SAP SHEL BP HMC NTES TME XPEV LI GRAB CPNG
CROX VKTX HIMS OSCR ACHR JOBY CVNA APP NBIS CRWV CRCL FIG OPEN GME AMC BYND PTON ZIM SQM TEAM WDAY MRVL LULU XYZ
BILL GTLB S ESTC CFLT FROG IOT HUBS ZI ASAN MNDY WIX GLBE FUBO QS CHPT PLUG FCEL RUN BE OKLO SMR LEU CCJ UUUU
NVTS WOLF LAZR RGTI QBTS BBAI SERV RIOT MARA CLSK HUT CORZ IREN WULF CIFR BTDR BITF GLXY BMNR SBET""".split()
FRESH = "--fresh" in sys.argv
if FRESH:
    urllib.request.urlretrieve("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv", ROOT / "data/sp500.csv")
rows = list(csv.DictReader(open(ROOT / "data/sp500.csv")))
universe = {r["Symbol"]: {"sector": r["GICS Sector"], "sp500": True} for r in rows}
for s in EXTRA:
    universe.setdefault(s, {"sp500": False})
out_path = ROOT / "data/universe.json"
old = json.load(open(out_path)) if out_path.exists() else {}
done = {} if FRESH else {k: v for k, v in old.items() if k in universe}
partial = ROOT / "data/.universe.partial.json"
US_EXCHANGES = ("NASDAQ", "NEW YORK STOCK EXCHANGE", "NYSE MKT", "NYSE ARCA", "NYSE AMERICAN", "CBOE", "BATS", "OTC")

# Home currency of the non-US exchanges our foreign primary listings trade on.
EXCHANGE_HOME = {"TOKYO": "JPY", "TAIWAN": "TWD", "SANTIAGO": "CLP", "COPENHAGEN": "DKK", "EURONEXT": "EUR",
                 "XETRA": "EUR", "HONG KONG": "HKD", "LONDON": "GBP", "SWISS": "CHF", "TORONTO": "CAD"}
MAX_USD_CAP = 10_000_000  # $10T in millions: bigger than any company, so a "USD" figure above it is local

def local_cap_currency(p):
    """Currency of profile2's marketCapitalization: the profile currency, unless the listing is a US
    exchange (an ADR's profile may carry its reporting currency, e.g. BABA "CNY", while its cap is USD).
    Finnhub sometimes labels a foreign listing's cap "USD" when it's local (SQM on Santiago: "USD"
    15.1T, really CLP), so an impossible USD figure falls back to the exchange's home currency."""
    ex = (p.get("exchange") or "").upper()
    cur = (p.get("currency") or "USD").upper()
    if any(ex.startswith(u) for u in US_EXCHANGES):
        return "USD"
    if cur == "USD" and (p.get("marketCapitalization") or 0) > MAX_USD_CAP:
        home = next((c for k, c in EXCHANGE_HOME.items() if k in ex), None)
        if home: return home
        print("cap looks local but exchange unknown", p.get("ticker"), ex)
    return cur

def usd_rate(cur):
    """USD per unit of `cur` and its date, from Yahoo's daily FX close (an allowed host). None on failure."""
    try:
        req = urllib.request.Request(f"https://query1.finance.yahoo.com/v8/finance/chart/{cur}USD=X?range=5d&interval=1d",
                                     headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.load(r)["chart"]["result"][0]
        pairs = [(t, c) for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c]
        t, c = pairs[-1]
        return c, datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat()
    except Exception as e:
        print("no fx rate", cur, e)
        return None
for i, (sym, base) in enumerate(universe.items()):
    if sym in done: continue
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"https://finnhub.io/api/v1/stock/profile2?symbol={sym}&token={KEY}", timeout=15) as r:
                p = json.load(r); break
        except Exception as e:
            print("retry", sym, e); time.sleep(5); p = {}
    if not p.get("name") and sym in old:
        done[sym] = old[sym]  # keep last-known profile rather than dropping a company on a blip
    if p.get("name"):
        done[sym] = {"n": p["name"], "logo": p.get("logo") or "", "mc": round(p.get("marketCapitalization") or 0),
                     "ind": p.get("finnhubIndustry") or "", "sec": base.get("sector") or p.get("finnhubIndustry") or "",
                     "c": p.get("country") or "", "web": p.get("weburl") or "", "sp": base["sp500"]}
        # Estimate currency (Finnhub calendar EPS/revenue for foreign filers is in it, not USD). Only
        # stored when it isn't USD. If Finnhub gives no estimateCurrency, keep the last-known value.
        ec = (p.get("estimateCurrency") or "").upper().replace("RMB", "CNY")
        if not ec and old.get(sym, {}).get("ec"):
            ec = old[sym]["ec"]
        if ec and ec != "USD":
            done[sym]["ec"] = ec
        # Market value (0042): profile2's marketCapitalization is in the *listing's* currency, so a
        # primary listing abroad (Toyota on Tokyo, TSMC on Taiwan) gives yen/TWD. `mc` is always USD
        # millions; the local figure and its currency are kept in mcL/mcCur and converted below.
        cur = local_cap_currency(p)
        if cur != "USD":
            done[sym].update({"mc": 0, "mcCur": cur, "mcL": round(p.get("marketCapitalization") or 0)})
            if old.get(sym, {}).get("mcCur") == cur and old[sym].get("fx"):
                done[sym].update({"fx": old[sym]["fx"], "fxAt": old[sym]["fxAt"]})  # last-known rate
    else:
        print("no profile", sym)
    if i % 25 == 0:
        json.dump(done, open(partial, "w")); print(i, sym, flush=True)
    time.sleep(1.05)
rates = {}
for sym, c in done.items():
    cur = c.get("mcCur")
    if not cur: continue
    if cur not in rates: rates[cur] = usd_rate(cur)
    if rates[cur]:
        c["fx"], c["fxAt"] = float(f"{rates[cur][0]:.6g}"), rates[cur][1]
    # No fresh or last-known rate: mc stays 0 (shown as "—", ranked last), never the local number.
    c["mc"] = round(c["mcL"] * c["fx"]) if c.get("fx") else 0
if len(done) < 0.9 * len(universe):
    sys.exit(f"refusing to write: only {len(done)}/{len(universe)} profiles fetched")
json.dump(dict(sorted(done.items())), open(out_path, "w"), separators=(",", ":"))
partial.unlink(missing_ok=True)
print("done", len(done))
