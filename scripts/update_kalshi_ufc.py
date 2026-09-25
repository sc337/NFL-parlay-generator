import json,re,urllib.parse,urllib.request
from datetime import datetime,timezone
from pathlib import Path
BASE="https://external-api.kalshi.com/trade-api/v2"
SERIES={"KXUFCFIGHT":"moneyline","KXUFCMOV":"method_victory","KXUFCMOF":"method_finish","KXUFCROUNDS":"round_finish","KXUFCDISTANCE":"distance"}
UA={"User-Agent":"sports-dashboard/1.0"}

def get(url,params=None):
    if params:url+="?"+urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30) as r:return json.load(r)

def markets(series):
    out=[];cursor=""
    while True:
        p={"series_ticker":series,"status":"open","limit":200,"mve_filter":"exclude"}
        if cursor:p["cursor"]=cursor
        d=get(BASE+"/markets",p);out+=d.get("markets",[]);cursor=d.get("cursor") or ""
        if not cursor:return out

def num(m,*ks):
    for k in ks:
        try:
            v=m.get(k)
            if v not in (None,""):return float(v)
        except:pass

def mid(m):
    b=num(m,"yes_bid_dollars");a=num(m,"yes_ask_dollars")
    if b is not None and a is not None and a>=b:return (b+a)/2,b,a
    return num(m,"last_price_dollars"),b,a

def label(m):return (m.get("yes_sub_title") or m.get("subtitle") or m.get("title") or "").strip()
def fight(m):
    s=(m.get("title") or "").strip()
    for x in [": Method of Victory",": Method of Finish",": Go the Distance",": Round of Finish"]:s=s.replace(x,"")
    return s
def fighters(text):
    s=re.sub(r"\s+"," ",text or "").strip()
    for sep in [" vs. "," vs "," v. "," v "," - "]:
        if sep in s:
            a,b=s.split(sep,1);return a.strip(),b.strip()
    return None,None

def ufcstats_search(name):
    q=urllib.parse.quote(name)
    try:
        raw=urllib.request.urlopen(urllib.request.Request("http://ufcstats.com/statistics/fighters/search?query="+q,headers=UA),timeout=20).read().decode("utf-8","ignore")
        links=re.findall(r'href="(http://ufcstats\.com/fighter-details/[^"]+)"',raw)
        return links[0] if links else None
    except:return None

def fighter_stats(name):
    url=ufcstats_search(name)
    if not url:return None
    try:
        h=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=20).read().decode("utf-8","ignore")
        def grab(p):
            m=re.search(p,h,re.I|re.S);return float(m.group(1)) if m else None
        rec=re.search(r"Record:\s*([0-9]+)-([0-9]+)-([0-9]+)",h,re.I)
        dob=re.search(r"DOB:</i>\s*([^<]+)",h,re.I);height=re.search(r"HEIGHT:</i>\s*([^<]+)",h,re.I);reach=re.search(r"REACH:</i>\s*([^<]+)",h,re.I);stance=re.search(r"STANCE:</i>\s*([^<]+)",h,re.I)
        fight_links=re.findall(r'data-link="(http://ufcstats\\.com/fight-details/[^"]+)"',h,re.I)
        return {"name":name,"url":url,"wins":int(rec.group(1)) if rec else None,"losses":int(rec.group(2)) if rec else None,
          "dob":dob.group(1).strip() if dob else None,"height":height.group(1).strip() if height else None,"reach":reach.group(1).strip() if reach else None,"stance":stance.group(1).strip() if stance else None,
          "fight_count":len(fight_links),"recent_fight_urls":fight_links[:5],
          "slpm":grab(r"SLpM:</i>\s*([0-9.]+)"),"sapm":grab(r"SApM:</i>\s*([0-9.]+)"),
          "str_acc":grab(r"Str\. Acc\.:</i>\s*([0-9.]+)%"),"str_def":grab(r"Str\. Def:</i>\s*([0-9.]+)%"),
          "td_avg":grab(r"TD Avg\.:</i>\s*([0-9.]+)"),"td_acc":grab(r"TD Acc\.:</i>\s*([0-9.]+)%"),
          "td_def":grab(r"TD Def\.:</i>\s*([0-9.]+)%"),"sub_avg":grab(r"Sub\. Avg\.:</i>\s*([0-9.]+)")}
    except:return None

now=datetime.now(timezone.utc);rows=[];counts={};names=set()
for series,kind in SERIES.items():
    try:ms=markets(series)
    except Exception as e:print(series,e);ms=[]
    counts[series]=len(ms)
    for m in ms:
        p,b,a=mid(m)
        if p is None or p<=0 or p>=1:continue
        close=m.get("close_time") or m.get("expected_expiration_time")
        try:
            if close and datetime.fromisoformat(close.replace("Z","+00:00"))<=now:continue
        except:pass
        f=fight(m);f1,f2=fighters(f)
        if f1:names.add(f1)
        if f2:names.add(f2)
        vol=num(m,"volume_fp","volume") or 0;oi=num(m,"open_interest_fp","open_interest") or 0
        rows.append({"ticker":m.get("ticker"),"event_ticker":m.get("event_ticker"),"series":series,"kind":kind,"fight":f,
          "fighter1":f1,"fighter2":f2,"label":label(m),"probability":round(p,4),"yes_bid":b,"yes_ask":a,
          "spread":round(a-b,4) if b is not None and a is not None else None,"volume":vol,"open_interest":oi,
          "close_time":close,"source":"Kalshi"})
stats={}
for n in sorted(names):
    s=fighter_stats(n)
    if s:stats[n]=s
rows.sort(key=lambda x:(x.get("close_time") or "9999",x["fight"],x["kind"]))
Path("data").mkdir(exist_ok=True)
Path("data/kalshi-ufc.json").write_text(json.dumps({"updated_at":now.isoformat(),"series_counts":counts,"fighter_stats_source":"UFCStats","fighter_stats":stats,"markets":rows},indent=2))
print("UFC markets",len(rows),"fighters",len(stats),counts)
