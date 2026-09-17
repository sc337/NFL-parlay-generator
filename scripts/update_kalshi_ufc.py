import json, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE="https://external-api.kalshi.com/trade-api/v2"
SERIES={"KXUFCFIGHT":"moneyline","KXUFCMOV":"method_victory","KXUFCMOF":"method_finish","KXUFCROUNDS":"round_finish","KXUFCDISTANCE":"distance"}

def get(path,params):
    url=BASE+path+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":"sports-dashboard/1.0"})
    with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)

def markets(series):
    out=[]; cursor=""
    while True:
        p={"series_ticker":series,"status":"open","limit":200,"mve_filter":"exclude"}
        if cursor:p["cursor"]=cursor
        d=get("/markets",p); out+=d.get("markets",[])
        cursor=d.get("cursor") or ""
        if not cursor:break
    return out

def num(m,*keys):
    for k in keys:
        try:
            v=m.get(k)
            if v not in (None,""): return float(v)
        except: pass
    return None

def midpoint(m):
    bid=num(m,"yes_bid_dollars"); ask=num(m,"yes_ask_dollars")
    if bid is not None and ask is not None and ask>=bid:return (bid+ask)/2,bid,ask
    last=num(m,"last_price_dollars")
    return last,bid,ask

def clean_label(m):
    return (m.get("yes_sub_title") or m.get("subtitle") or m.get("title") or "").strip()

def fight_name(m):
    title=(m.get("title") or "").strip()
    for suffix in [": Method of Victory",": Method of Finish",": Go the Distance",": Round of Finish"]:
        title=title.replace(suffix,"")
    return title

now=datetime.now(timezone.utc)
rows=[]; counts={}
for series,kind in SERIES.items():
    try: ms=markets(series)
    except Exception as e:
        print(series,e); ms=[]
    counts[series]=len(ms)
    for m in ms:
        p,bid,ask=midpoint(m)
        if p is None or p<=0 or p>=1: continue
        close=m.get("close_time") or m.get("expected_expiration_time")
        try:
            if close and datetime.fromisoformat(close.replace("Z","+00:00"))<=now: continue
        except: pass
        vol=num(m,"volume_fp","volume") or 0
        oi=num(m,"open_interest_fp","open_interest") or 0
        spread=(ask-bid) if bid is not None and ask is not None else None
        rows.append({"ticker":m.get("ticker"),"event_ticker":m.get("event_ticker"),"series":series,"kind":kind,
          "fight":fight_name(m),"label":clean_label(m),"probability":round(p,4),"yes_bid":bid,"yes_ask":ask,
          "spread":round(spread,4) if spread is not None else None,"volume":vol,"open_interest":oi,
          "close_time":close,"source":"Kalshi"})
rows.sort(key=lambda x:(x.get("close_time") or "9999",x["fight"],x["kind"]))
Path("data").mkdir(exist_ok=True)
Path("data/kalshi-ufc.json").write_text(json.dumps({"updated_at":now.isoformat(),"series_counts":counts,"markets":rows},indent=2))
print("UFC markets",len(rows),counts)
