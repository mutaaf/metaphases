"""Refresh data/etf_holdings.json (top-10 holdings for Compass look-through) from Yahoo via yfinance.
Usage: pip install yfinance && python3 scripts/refresh_etfs.py"""
import datetime, json, pathlib, sys
import yfinance as yf

ROOT = pathlib.Path(__file__).resolve().parent.parent
path = ROOT / "data/etf_holdings.json"
data = json.load(open(path))
ok = 0
for sym, meta in data["etfs"].items():
    try:
        th = yf.Ticker(sym).funds_data.top_holdings
        rows = [[str(i), round(float(r["Holding Percent"]) * 100, 2)] for i, r in th.iterrows()]
        if len(rows) >= 5:
            meta["h"] = rows; ok += 1
    except Exception as e:  # keep last-known holdings for that fund
        print("keep", sym, e, file=sys.stderr)
if ok < len(data["etfs"]) * 0.6:
    sys.exit(f"refusing to write: only {ok}/{len(data['etfs'])} funds refreshed")
data["asOf"] = datetime.date.today().isoformat()
json.dump(data, open(path, "w"), separators=(",", ":"))
print(f"refreshed {ok}/{len(data['etfs'])} funds")
