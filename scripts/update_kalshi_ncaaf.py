"""Free Kalshi NCAAF selections; normalized prices refer to the selected side."""
import json, math, re, urllib.parse, urllib.request, time
from datetime import datetime, timezone
from pathlib import Path
BASE = "https://external-api.kalshi.com/trade-api/v2"
SERIES = {"KXNCAAFGAME": "moneyline", "KXNCAAFSPREAD": "spread", "KXNCAAFTOTAL": "total"}

def request_json(url, attempts=3):
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "sports-dashboard/1.0", "Accept": "application/json"}), timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt+1 == attempts:
                raise
            time.sleep(2**attempt)

def get(series):
    rows, cursor = [], ""
    while True:
        params = {"series_ticker": series, "status": "open", "limit": 200, "mve_filter": "exclude"}
        if cursor:
            params["cursor"] = cursor
        data = request_json(BASE+"/markets?"+urllib.parse.urlencode(params))
        rows.extend(data.get("markets", []))
        next_cursor = data.get("cursor") or ""
        if not next_cursor or next_cursor == cursor:
            return rows
        cursor = next_cursor

def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None

def price(market, side, action):
    for field, scale in ((side+"_"+action+"_dollars", 1), (side+"_"+action, 100)):
        if market.get(field) not in (None, ""):
            value = number(market[field])
            return value/scale if value is not None and 0 < value/scale < 1 else None
    opposite = "no" if side == "yes" else "yes"
    other_action = "bid" if action == "ask" else "ask"
    # NO ask = 1 - YES bid, never 1 - YES ask.
    for field, scale in ((opposite+"_"+other_action+"_dollars", 1), (opposite+"_"+other_action, 100)):
        if market.get(field) not in (None, ""):
            value = number(market[field])
            return round(1-value/scale, 8) if value is not None and 0 < value/scale < 1 else None
    return None

def key(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())

def event_key(market):
    return str(market.get("event_ticker", "")).partition("-")[2]

def teams_by_event(markets):
    teams = {}
    for market in markets:
        match = re.fullmatch(r"(.+?) wins", str(market.get("title", "")).strip(), re.I)
        if match and event_key(market):
            teams.setdefault(event_key(market), {})[key(match[1])] = match[1].strip()
    return teams

def normalize_market(market, series, teams=None):
    if market.get("status") in ("settled", "closed", "finalized"):
        return []
    kind = SERIES[series]
    title = str(market.get("title") or "").strip()
    label = str(market.get("yes_sub_title") or market.get("subtitle") or title).strip()
    selections = [("yes", title, label, None, None)]
    spread = re.fullmatch(r"(.+?) wins by over (\d+(?:\.\d+)?) points?", title, re.I) if kind == "spread" else None
    total = re.fullmatch(r"(Over|Under) (\d+(?:\.\d+)?) points scored", title, re.I) if kind == "total" else None
    if spread and float(spread[2]) % 1 == .5:
        line, selected = float(spread[2]), spread[1].strip()
        selections = [("yes", title, f"{selected} -{line:g}", selected, -line)]
        names = teams or {}
        if len(names) == 2 and key(selected) in names:
            opponent = next(name for name_key, name in names.items() if name_key != key(selected))
            selections.append(("no", f"{opponent} +{line:g}", f"{opponent} +{line:g}", opponent, line))
    elif total and float(total[2]) % 1 == .5:
        opposite = "Under" if total[1].lower() == "over" else "Over"
        selections.append(("no", f"{opposite} {float(total[2]):g} points scored", f"{opposite} {float(total[2]):g} points scored", None, float(total[2])))
    rows = []
    for side, selected_title, selected_label, selected_team, point in selections:
        ask, bid = price(market, side, "ask"), price(market, side, "bid")
        if ask is None or bid is None or not 0 < bid <= ask < 1:
            continue
        rows.append({"ticker": market.get("ticker"), "event_ticker": market.get("event_ticker"), "series": series, "kind": kind,
                     "side": side, "quoteSide": side, "selection_id": str(market.get("ticker") or "")+"|"+side,
                     "contract_title": title, "title": selected_title, "label": selected_label,
                     "selection_team": selected_team, "point": point,
                     "probability": round((bid+ask)/2, 6), "yes_bid": bid, "yes_ask": ask, "spread": round(ask-bid, 6),
                     "volume": number(market.get("volume_fp", market.get("volume"))) or 0,
                     "open_interest": number(market.get("open_interest_fp", market.get("open_interest"))) or 0,
                     "close_time": market.get("close_time") or market.get("expected_expiration_time"), "source": "Kalshi"})
    return rows

def main():
    now, rows, counts, collected = datetime.now(timezone.utc), [], {}, {}
    for series in SERIES:
        try:
            collected[series] = get(series)
        except Exception as error:
            print(series, error)
            collected[series] = []
        counts[series] = len(collected[series])
    teams = teams_by_event(collected["KXNCAAFGAME"])
    for series, markets in collected.items():
        for market in markets:
            close = market.get("close_time") or market.get("expected_expiration_time")
            try:
                if close and datetime.fromisoformat(close.replace("Z", "+00:00")) <= now:
                    continue
            except (ValueError, TypeError):
                continue
            rows.extend(normalize_market(market, series, teams.get(event_key(market))))
    rows.sort(key=lambda row: (row.get("close_time") or "9999", row.get("event_ticker") or "", row["kind"], row["selection_id"]))
    if not rows and not any(counts.values()):
        raise RuntimeError("All Kalshi NCAAF series returned no markets; keeping the prior snapshot")
    target = Path("data/kalshi-ncaaf.json")
    target.parent.mkdir(exist_ok=True)
    payload = {"updated_at": now.isoformat(), "series_counts": counts, "markets": rows}
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2)+"\n")
    json.loads(temporary.read_text())
    temporary.replace(target)
    print("NCAAF selections", len(rows), "NO sides", sum(row["quoteSide"] == "no" for row in rows), counts)

if __name__ == "__main__":
    main()
