"""Stamp each universe entry with the close its market cap was taken at (0073).

`mc` is a snapshot: Finnhub's profile2 cap at the build, which reflects the last close before the run. Between
refreshes the worker scales it by the stock's move since then (shared/marketCap.ts `capNow`), so every entry
carries `mcAt` (the trading day of that close) and `px` (the close, from Yahoo, the same series the worker's
chart uses). No close found leaves `mcAt` with no `px`: the worker reads that day's close off its own chart.

  build_universe.py calls stamp(done) after converting currencies.
  python3 scripts/universe_px.py --rebase [--base YYYY-MM-DD] [SYM,SYM=YYYY-MM-DD ...]
    rescales every `mc` to the latest close (shares held constant), restamping px/mcAt. An entry with no
    `mcAt` yet is taken to be as of --base (or its SYM=DATE override). Run by hand only when a refresh is late.
"""
import datetime, json, pathlib, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0"}  # a longer browser string is throttled (429) from some hosts
# The worker refuses a move this large as a split or bad data and shows the stored cap with its date.
MAX_RATIO = 5.0


def yahoo_symbol(sym):
    return sym.replace(".", "-")  # shared/shareClass.ts yahooSymbol


def closes(sym, start, end, tries=3):
    """[(YYYY-MM-DD, close)] from Yahoo daily bars, oldest first; [] on any failure."""
    p1 = int(datetime.datetime.combine(start, datetime.time(), datetime.timezone.utc).timestamp())
    p2 = int(datetime.datetime.combine(end + datetime.timedelta(days=1), datetime.time(), datetime.timezone.utc).timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol(sym)}?period1={p1}&period2={p2}&interval=1d"
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
                res = json.load(r)["chart"]["result"][0]
            out = []
            for t, c in zip(res.get("timestamp") or [], res["indicators"]["quote"][0].get("close") or []):
                if c:  # shared/depth.ts nyDate: the bar's UTC date (bars open at 13:30/14:30 UTC)
                    out.append((datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat(), round(c, 4)))
            return out
        except Exception as e:
            print("retry", sym, e, flush=True)
            if attempt + 1 < tries:
                time.sleep(2 + attempt * 3)
    return []


def close_on_or_before(series, day):
    hit = [x for x in series if x[0] <= day]
    return hit[-1] if hit else None


# The weekly refresh has 40 minutes and the Finnhub pass takes ~11: Yahoo must never cost it the refresh.
GIVE_UP_AFTER = 10      # consecutive symbols with no closes: Yahoo is blocking this runner
DEADLINE_S = 8 * 60     # whole pass


def stamp(universe, today=None):
    """Set mcAt to the last trading day before `today` (UTC) and px to its close, in place.

    Meant for the Sunday refresh: on a weekday run after 4 p.m. ET, Finnhub's cap may already include that day's
    close, so the worker would count the day's move twice. If Yahoo stops answering (GIVE_UP_AFTER empty answers
    in a row, or DEADLINE_S), the rest get mcAt only: the worker reads that day's close off its own chart."""
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    before = (today - datetime.timedelta(days=1)).isoformat()
    t0, empty, gave_up = time.monotonic(), 0, False
    for i, (sym, c) in enumerate(universe.items()):
        if not gave_up and (empty >= GIVE_UP_AFTER or time.monotonic() - t0 > DEADLINE_S):
            gave_up = True
            print(f"Yahoo not answering ({empty} empty in a row); stamping mcAt only from {sym}", flush=True)
        series = [] if gave_up else closes(sym, today - datetime.timedelta(days=12), today - datetime.timedelta(days=1), tries=2)
        empty = 0 if series else empty + 1
        hit = close_on_or_before(series, before)
        c.pop("px", None)
        if hit:
            c["mcAt"], c["px"] = hit
        else:
            # The cap still dates from the last close; Yahoo just didn't answer. The worker reads that close itself.
            c["mcAt"] = last_weekday(before)
            if not gave_up:
                print("no close", sym, flush=True)
        if gave_up:
            continue
        if i % 50 == 0:
            print("px", i, sym, flush=True)
        time.sleep(0.25)


def last_weekday(day):
    d = datetime.date.fromisoformat(day)
    while d.weekday() >= 5:
        d -= datetime.timedelta(days=1)
    return d.isoformat()


def rebase(universe, base, overrides, today=None):
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    moved = skipped = 0
    for i, (sym, c) in enumerate(universe.items()):
        at = c.get("mcAt") or overrides.get(sym) or base
        start = min(datetime.date.fromisoformat(at), today) - datetime.timedelta(days=10)
        series = closes(sym, start, today)
        ref = close_on_or_before(series, at)
        last = series[-1] if series else None
        if c.get("mc", 0) > 0 and ref and last and last[0] > ref[0]:
            ratio = last[1] / ref[1]
            if 1 / MAX_RATIO <= ratio <= MAX_RATIO:
                if c.get("mcL") and c.get("fx") and c.get("fxAt"):
                    # A converted cap (0042) keeps mc = mcL × fx. The dollar figure moves with the US listing; mcL
                    # absorbs any currency move too, until the next build refetches it.
                    c["mcL"] = round(c["mcL"] * ratio)
                    c["mc"] = round(c["mcL"] * c["fx"])
                else:
                    c["mc"] = round(c["mc"] * ratio)
                moved += 1
            else:
                print("implausible move, cap kept", sym, ref, last, flush=True); skipped += 1
                last = ref
        elif not last:
            print("no closes, left as is", sym, flush=True); skipped += 1
            c.setdefault("mcAt", at)
            continue
        elif not ref:
            # Closes exist, but none on or before the cap's day (a listing newer than its base): keep that day, no px.
            print("no close on", at, "left unscaled", sym, flush=True); skipped += 1
            c["mcAt"] = at
            c.pop("px", None)
            continue
        else:
            last = ref
        c["mcAt"], c["px"] = last
        if i % 50 == 0:
            print("rebase", i, sym, flush=True)
        time.sleep(0.25)
    print(f"rebased {moved}, skipped {skipped}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--rebase" not in args:
        sys.exit(__doc__)
    base = args[args.index("--base") + 1] if "--base" in args else None
    overrides = {}
    for a in args:
        if "=" in a and not a.startswith("--"):
            syms, day = a.split("=")
            overrides.update({s: day for s in syms.split(",")})
    path = ROOT / "data/universe.json"
    u = json.load(open(path))
    if base is None and any("mcAt" not in c for c in u.values()):
        sys.exit("entries without mcAt: pass --base YYYY-MM-DD (the close their caps were taken at)")
    rebase(u, base, overrides)
    json.dump(dict(sorted(u.items())), open(path, "w"), separators=(",", ":"))
