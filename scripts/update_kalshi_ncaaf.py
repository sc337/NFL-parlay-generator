import json,urllib.parse,urllib.request
from datetime import datetime,timezone
from pathlib import Path
BASE="https://external-api.kalshi.com/trade-api/v2"
SERIES={"KXNCAAFGAME":"moneyline","KXNCAAFSPREAD":"spread","KXNCAAFTOTAL":"total"}
def get(series):
 out=[];cur=""
 while True:
  p={"series_ticker":series,"status":"open","limit":200,"mve_filter":"exclude"}
  if cur:p["cursor"]=cur
  u=BASE+"/markets?"+urllib.parse.urlencode(p)
  with urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"sports-dashboard/1.0"}),timeout=30) as r:d=json.load(r)
  out+=d.get("markets",[]);cur=d.get("cursor") or ""
  if not cur:return out
def n(m,*ks):
 for k in ks:
  try:
   v=m.get(k)
   if v not in (None,""):return float(v)
  except:pass
def mid(m):
 b=n(m,"yes_bid_dollars");a=n(m,"yes_ask_dollars")
 return (((b+a)/2 if b is not None and a is not None and a>=b else n(m,"last_price_dollars")),b,a)
now=datetime.now(timezone.utc);rows=[];counts={}
for s,kind in SERIES.items():
 try:ms=get(s)
 except Exception as e:print(s,e);ms=[]
 counts[s]=len(ms)
 for m in ms:
  p,b,a=mid(m)
  if p is None or not 0<p<1:continue
  close=m.get("close_time") or m.get("expected_expiration_time")
  try:
   if close and datetime.fromisoformat(close.replace("Z","+00:00"))<=now:continue
  except:pass
  rows.append({"ticker":m.get("ticker"),"event_ticker":m.get("event_ticker"),"series":s,"kind":kind,
   "title":(m.get("title") or "").strip(),"label":(m.get("yes_sub_title") or m.get("subtitle") or m.get("title") or "").strip(),
   "probability":round(p,4),"yes_bid":b,"yes_ask":a,"spread":round(a-b,4) if b is not None and a is not None else None,
   "volume":n(m,"volume_fp","volume") or 0,"open_interest":n(m,"open_interest_fp","open_interest") or 0,"close_time":close,"source":"Kalshi"})
rows.sort(key=lambda x:(x.get("close_time") or "9999",x["event_ticker"] or "",x["kind"]))
Path("data").mkdir(exist_ok=True)
Path("data/kalshi-ncaaf.json").write_text(json.dumps({"updated_at":now.isoformat(),"series_counts":counts,"markets":rows},indent=2))
print("NCAAF markets",len(rows),counts)
