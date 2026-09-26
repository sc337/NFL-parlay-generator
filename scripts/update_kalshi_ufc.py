import json,re,urllib.parse,urllib.request,unicodedata,html
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
BASE="https://external-api.kalshi.com/trade-api/v2"
SERIES={"KXUFCFIGHT":"moneyline","KXUFCMOV":"method_victory","KXUFCMOF":"method_finish","KXUFCROUNDS":"round_finish","KXUFCDISTANCE":"distance"}
UA={"User-Agent":"sports-dashboard/1.0"}

def get(url,params=None):
    if params:url+="?"+urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30) as r:return json.load(r)

def official_cards():
    """Read event names and card start times from UFC's public events schedule."""
    url='https://www.ufc.com/events'
    page=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15).read().decode('utf-8','ignore')
    cards={}
    pattern=r'<h3 class="c-card-event--result__headline">\s*<a href="([^"]+)">([^<]+)</a></h3>'
    for match in re.finditer(pattern,page,re.I):
        path,head=match.groups();fragment=page[match.end():match.end()+1200]
        main=re.search(r'data-main-card-timestamp="(\d+)"',fragment)
        if not main:continue
        start=datetime.fromtimestamp(int(main.group(1)),timezone.utc)
        prelim=re.search(r'data-prelims-card-timestamp="(\d+)"',fragment)
        first=datetime.fromtimestamp(int(prelim.group(1)),timezone.utc) if prelim else start
        day=start.astimezone(ZoneInfo('America/New_York')).date().isoformat()
        prefix='UFC Fight Night' if '/ufc-fight-night-' in path else 'UFC '+path.rstrip('/').rsplit('ufc-',1)[-1] if '/ufc-' in path else ''
        if not prefix:continue
        cards[day]={'title':prefix+': '+html.unescape(head).strip(),'firstBell':first.isoformat().replace('+00:00','Z'),
                    'displayUntil':(start+timedelta(hours=6)).isoformat().replace('+00:00','Z'),
                    'source':'https://www.ufc.com'+path}
    if not cards:raise ValueError('No named UFC events found')
    return cards

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
        raw=urllib.request.urlopen(urllib.request.Request("https://ufcstats.com/statistics/fighters/search?query="+q,headers=UA),timeout=20).read().decode("utf-8","ignore")
        links=re.findall(r'href=[\"\'](https?://ufcstats\.com/fighter-details/[^\"\']+)',raw,re.I)
        return links[0] if links else None
    except Exception as exc:
        print('UFCStats search failed',name,exc);return None

def recent_fights(urls):
    out=[]
    for url in urls[:5]:
        try:
            h=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=20).read().decode("utf-8","ignore")
            result=re.search(r'<i[^>]*class="[^"]*b-fight-details__person-status[^"]*"[^>]*>\s*([WLNC]+)',h,re.I)
            method=re.search(r'METHOD:</i>\s*</i>?\s*<i[^>]*>\s*([^<]+)',h,re.I|re.S)
            rnd=re.search(r'ROUND:</i>\s*</i>?\s*<i[^>]*>\s*([0-9]+)',h,re.I|re.S)
            sig=re.findall(r'<p[^>]*class="[^"]*b-fight-details__table-text[^"]*"[^>]*>\s*([0-9]+)\s+of\s+([0-9]+)',h,re.I)
            out.append({"url":url,"result":result.group(1).upper() if result else None,"method":method.group(1).strip() if method else None,
              "round":int(rnd.group(1)) if rnd else None,"sig_strikes":int(sig[0][0]) if sig else None,"sig_attempts":int(sig[0][1]) if sig else None})
        except Exception as e: print("recent fight",url,e)
    wins=sum(1 for x in out if x.get("result")=="W"); losses=sum(1 for x in out if x.get("result")=="L")
    return {"fights":out,"count":len(out),"wins":wins,"losses":losses,"winRate":round(wins/max(1,wins+losses),3) if out else None}

def fighter_stats(name):
    url=ufcstats_search(name)
    if not url:return None
    url=url.replace('http://','https://')
    try:
        h=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=20).read().decode("utf-8","ignore")
        def grab(p):
            m=re.search(p,h,re.I|re.S);return float(m.group(1)) if m else None
        rec=re.search(r"Record:\s*([0-9]+)-([0-9]+)-([0-9]+)",h,re.I)
        dob=re.search(r"DOB:</i>\s*([^<]+)",h,re.I);height=re.search(r"HEIGHT:</i>\s*([^<]+)",h,re.I);reach=re.search(r"REACH:</i>\s*([^<]+)",h,re.I);stance=re.search(r"STANCE:</i>\s*([^<]+)",h,re.I)
        fight_links=re.findall(r'data-link="(http://ufcstats\\.com/fight-details/[^"]+)"',h,re.I)
        return {"name":name,"url":url,"wins":int(rec.group(1)) if rec else None,"losses":int(rec.group(2)) if rec else None,
          "dob":dob.group(1).strip() if dob else None,"height":height.group(1).strip() if height else None,"reach":reach.group(1).strip() if reach else None,"stance":stance.group(1).strip() if stance else None,
          "fight_count":len(fight_links),"recent_fight_urls":fight_links[:5],"recent5":recent_fights(fight_links),
          "slpm":grab(r"SLpM:</i>\s*([0-9.]+)"),"sapm":grab(r"SApM:</i>\s*([0-9.]+)"),
          "str_acc":grab(r"Str\. Acc\.:</i>\s*([0-9.]+)%"),"str_def":grab(r"Str\. Def:</i>\s*([0-9.]+)%"),
          "td_avg":grab(r"TD Avg\.:</i>\s*([0-9.]+)"),"td_acc":grab(r"TD Acc\.:</i>\s*([0-9.]+)%"),
          "td_def":grab(r"TD Def\.:</i>\s*([0-9.]+)%"),"sub_avg":grab(r"Sub\. Avg\.:</i>\s*([0-9.]+)")}
    except Exception as exc:
        print('UFCStats profile failed',name,exc);return None

def official_profile(name):
    slug=unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()
    slug=re.sub(r'[^a-z0-9]+','-',slug).strip('-')
    url='https://www.ufc.com/athlete/'+slug
    try:
        html=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=12).read().decode('utf-8','ignore')
        if 'hero-profile__division-body' not in html:return None
        record=re.search(r'hero-profile__division-body[^>]*>\s*(\d+)-(\d+)-(\d+)\s*\(W-L-D\)',html,re.I)
        metric=dict((label.strip().lower(),float(value.strip())) for value,label in re.findall(
            r'c-stat-compare__number[^>]*>\s*([0-9.]+)\s*</div>\s*<div class="c-stat-compare__label">\s*([^<]+)</div>',html,re.I))
        accuracy=re.search(r'<title>Striking accuracy\s+(\d+)%</title>',html,re.I)
        if not record or 'sig. str. landed' not in metric:return None
        return {'name':name,'url':url,'source':'UFC.com','fetched_at':now.isoformat(),
                'wins':int(record[1]),'losses':int(record[2]),'draws':int(record[3]),
                'slpm':metric.get('sig. str. landed'),'sapm':metric.get('sig. str. absorbed'),
                'str_acc':float(accuracy[1]) if accuracy else None,
                'td_avg':metric.get('takedown avg'),'sub_avg':metric.get('submission avg')}
    except Exception as exc:
        print('UFC athlete page unavailable',name,exc);return None

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
# Fight series use separate event tickers for the same bout. Group by date and
# the common bout code, then resolve opponents from both winner selections.
by_bout={}
for row in rows:
    match=re.search(r'-(\d{2}[A-Z]{3}\d{2}[A-Z]+)',row.get('event_ticker') or '')
    if not match:continue
    by_bout.setdefault(match.group(1),[]).append(row)
for group in by_bout.values():
    selections={(r.get('label') or r.get('title') or '').removesuffix(' wins').strip() for r in group if r['kind']=='moneyline' and (r.get('label') or r.get('title'))}
    if len(selections)!=2:continue
    a,b=sorted(selections)
    for row in group:row['fighter1']=a;row['fighter2']=b;row['fight']=a+' vs '+b
    names.update((a,b))
# Verify bout identity and bell time against the actual fight schedule.
if not rows and not any(counts.values()):
    raise RuntimeError('All Kalshi UFC series returned no markets; keeping the prior snapshot')
for code,group in by_bout.items():
    names_in_group={r.get('fighter1') for r in group if r.get('fighter1')}|{r.get('fighter2') for r in group if r.get('fighter2')}
    if len(names_in_group)!=2:continue
    try:day=datetime.strptime(code[:7],'%y%b%d').strftime('%Y%m%d')
    except ValueError:continue
    try:
        schedule=get('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard',{'dates':day})
    except Exception as exc:
        print('UFC schedule unavailable',day,exc);continue
    matches=[]
    def key(s):return re.sub(r'[^a-z0-9]','',str(s or '').lower())
    for event in schedule.get('events',[]):
        for competition in event.get('competitions',[]):
            competitors=competition.get('competitors',[])
            fighters={key((c.get('athlete') or c).get('displayName') or (c.get('athlete') or c).get('fullName')) for c in competitors}
            if fighters=={key(n) for n in names_in_group}:matches.append((event,competition))
    if len(matches)!=1:continue
    event,competition=matches[0];start=competition.get('date') or event.get('date')
    if not start:continue
    for row in group:
        row['game_id']=str(competition.get('id') or code);row['game_time']=start
        row['game_status']=(competition.get('status') or event.get('status') or {}).get('type',{}).get('state')
try:previous=json.loads(Path('data/kalshi-ufc.json').read_text()).get('fighter_stats') or {}
except (OSError,ValueError):previous={}
stats={}
pending=[]
for n in sorted(names):
    old=previous.get(n) or {}
    try:recent=(now-datetime.fromisoformat(old.get('fetched_at','').replace('Z','+00:00'))).total_seconds()<24*3600
    except ValueError:recent=False
    if recent:stats[n]=old
    else:pending.append(n)
with ThreadPoolExecutor(max_workers=6) as pool:
    futures={pool.submit(official_profile,n):n for n in pending}
    for future in as_completed(futures):
        profile=future.result()
        if profile:stats[futures[future]]=profile
try:previous_cards=json.loads(Path('data/kalshi-ufc.json').read_text()).get('cards') or {}
except (OSError,ValueError):previous_cards={}
try:cards=official_cards()
except Exception as exc:
    print('Official UFC schedule unavailable',exc);cards=previous_cards
# The Contender Series is listed separately from the UFC Fight Night schedule.
cards.setdefault('2026-09-29',{'title':"Dana White’s Contender Series: Season 10, Episode 8",
    'source':'https://www.ufc.com/news/dwcs-season-10-episode-8-preview-athletes-bouts-start-time-streaming'})
rows.sort(key=lambda x:(x.get("close_time") or "9999",x["fight"],x["kind"]))
Path("data").mkdir(exist_ok=True)
Path("data/kalshi-ufc.json").write_text(json.dumps({"updated_at":now.isoformat(),"series_counts":counts,"fighter_stats_source":"UFC.com","fighter_stats":stats,"cards":cards,"markets":rows},indent=2))
print("UFC markets",len(rows),"fighters",len(stats),counts)
