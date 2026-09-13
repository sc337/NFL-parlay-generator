import json, re, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASES=['https://api.elections.kalshi.com/trade-api/v2/markets','https://external-api.kalshi.com/trade-api/v2/markets']
SERIES=['KXNFLGAME','KXNFLSPREAD','KXNFLTOTAL','KXNFLTD','KXNFLRECYDS','KXNFLRUSHYDS','KXNFLPASSYDS','KXNFLRECEPTIONS']
TEAM_CODES={'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills','CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns','DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers','HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs','LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LAR':'Los Angeles Rams','MIA':'Miami Dolphins','MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints','NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers','SEA':'Seattle Seahawks','SF':'San Francisco 49ers','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans','WAS':'Washington Commanders'}
ALIASES={'JAC':'JAX','WSH':'WAS','LA':'LAR'}
ALL_CODES={**TEAM_CODES,**{a:TEAM_CODES[b] for a,b in ALIASES.items()}}

def fetch_json(url,timeout=20):
    req=Request(url,headers={'User-Agent':'NFL-parlay-generator/1.0','Accept':'application/json'})
    with urlopen(req,timeout=timeout) as r:return json.loads(r.read().decode())

def fetch_series(series):
    last=None
    for base in BASES:
        try:
            q=urlencode({'status':'open','limit':1000,'series_ticker':series})
            d=fetch_json(base+'?'+q)
            return d.get('markets',[]) if isinstance(d,dict) else []
        except Exception as e:last=e
    print('WARN',series,last,file=sys.stderr);return []

def prob(m):
    vals=[]
    for k in ('yes_bid_dollars','yes_ask_dollars'):
        try:
            f=float(m.get(k));
            if 0<f<1:vals.append(f)
        except:pass
    if len(vals)==2:return sum(vals)/2
    try:
        f=float(m.get('last_price_dollars'))
        if 0<f<1:return f
    except:pass
    if vals:return vals[0]
    for k in ('yes_bid','yes_ask','last_price'):
        try:
            f=float(m.get(k))/100
            if 0<f<1:return f
        except:pass
    return None

def american(p):
    if p is None or p<=0 or p>=1:return None
    return round(-100*p/(1-p)) if p>=.5 else round(100*(1-p)/p)

def quality(m,p):
    q=68
    try:
        v=float(m.get('volume') or m.get('volume_fp') or 0);oi=float(m.get('open_interest') or m.get('open_interest_fp') or 0)
        if v>=1000:q+=5
        if oi>=1000:q+=5
    except:pass
    if .2<=p<=.8:q+=4
    return min(90,q)

def matchup(m):
    e=str(m.get('event_ticker') or '').upper()
    mm=re.search(r'-\d{2}[A-Z]{3}\d{2}([A-Z]+)$',e)
    if not mm:return None
    tail=mm.group(1)
    pairs=[]
    for a,an in ALL_CODES.items():
        for b,bn in ALL_CODES.items():
            if a==b:continue
            if a+b==tail:pairs.append((a,b,an,bn))
    if not pairs:return None
    # Prefer canonical NFL abbreviations over aliases.
    pairs.sort(key=lambda x:(x[0] not in TEAM_CODES)+(x[1] not in TEAM_CODES))
    a,b,an,bn=pairs[0]
    return {'codes':(a,b),'teams':(an,bn),'key':'|'.join(sorted((an,bn)))}

def game_obj(info,m,now):
    return {'id':'kalshi-'+re.sub(r'[^a-z0-9]+','-',info['key'].lower()).strip('-'),'away':info['teams'][0],'home':info['teams'][1],'commence_time':m.get('close_time') or m.get('expected_expiration_time') or now.isoformat(),'markets':[],'dataSource':'Kalshi','_candidates':{'totals':[],'spreads':[],'props':{}}}

def add_leg(g,leg):
    g['markets'].append(leg)

def base_leg(m,p):return {'price':american(p),'prob':p,'source':'Kalshi','sourceQuality':quality(m,p)}

def parse_moneyline(m,g,info):
    p=prob(m)
    if p is None:return
    suffix=str(m.get('ticker') or '').upper().rsplit('-',1)[-1]
    team=None
    for code,name in ALL_CODES.items():
        if suffix==code:team=name;break
    if team not in info['teams']:return
    add_leg(g,{'type':'h2h','marketKey':'h2h','name':team+' ML','team':team,**base_leg(m,p)})

def parse_total(m,g):
    p=prob(m);title=str(m.get('title') or '')
    mm=re.search(r'over\s+(\d+(?:\.\d+)?)\s+points',title,re.I)
    if p is None or not mm:return
    pt=float(mm.group(1));g['_candidates']['totals'].append((abs(p-.5),pt,m,p))

def parse_spread(m,g,info):
    p=prob(m);title=str(m.get('title') or '')
    mm=re.search(r'(.+?)\s+wins by over\s+(\d+(?:\.\d+)?)\s+points',title,re.I)
    if p is None or not mm:return
    suffix=str(m.get('ticker') or '').upper().rsplit('-',1)[-1]
    code=None
    for c in info['codes']:
        if suffix.startswith(c):code=c;break
    if code is None:
        for c in ALL_CODES:
            if suffix.startswith(c) and ALL_CODES[c] in info['teams']:code=c;break
    if code is None:return
    team=ALL_CODES[code];other=info['teams'][0] if info['teams'][1]==team else info['teams'][1]
    line=float(mm.group(2));g['_candidates']['spreads'].append((abs(p-.5),line,team,other,m,p))

def parse_prop(m,g,series):
    p=prob(m);title=str(m.get('title') or '')
    if p is None:return
    if series=='KXNFLTD':
        mm=re.match(r'^(.+?):\s*(\d+)\+\s+touchdowns?$',title,re.I)
        if not mm or int(mm.group(2))!=1:return
        player=mm.group(1).strip()
        add_leg(g,{'type':'td','marketKey':'player_anytime_td','player':player,'team':'Player','side':'yes','name':player+' anytime TD',**base_leg(m,p)})
        return
    maps={'KXNFLRECYDS':('receiving','player_reception_yds','receiving yards'),'KXNFLRUSHYDS':('rushing','player_rush_yds','rushing yards'),'KXNFLPASSYDS':('passing','player_pass_yds','passing yards'),'KXNFLRECEPTIONS':('receiving','player_receptions','receptions')}
    if series not in maps:return
    typ,key,label=maps[series]
    mm=re.match(r'^(.+?):\s*(\d+(?:\.\d+)?)\+\s+'+re.escape(label)+r'$',title,re.I)
    if not mm:return
    player=mm.group(1).strip();threshold=float(mm.group(2));line=max(.5,threshold-.5)
    k=(player,key)
    g['_candidates']['props'].setdefault(k,[]).append((abs(p-.5),line,m,p,typ,label))

def finalize(g):
    # Main total = binary threshold closest to 50/50. No side is exact complement at half-point lines.
    totals=g['_candidates']['totals']
    if totals:
        _,pt,m,p=min(totals,key=lambda x:x[0])
        add_leg(g,{'type':'totals','marketKey':'totals','name':f'Over {pt:g}','team':'Game','side':'over','point':pt,**base_leg(m,p)})
        q=1-p;add_leg(g,{'type':'totals','marketKey':'totals','name':f'Under {pt:g}','team':'Game','side':'under','point':pt,**base_leg(m,q)})
    spreads=g['_candidates']['spreads']
    if spreads:
        _,line,team,other,m,p=min(spreads,key=lambda x:x[0])
        add_leg(g,{'type':'spreads','marketKey':'spreads','name':f'{team} -{line:g}','team':team,'point':-line,**base_leg(m,p)})
        q=1-p;add_leg(g,{'type':'spreads','marketKey':'spreads','name':f'{other} +{line:g}','team':other,'point':line,**base_leg(m,q)})
    for (player,key),rows in g['_candidates']['props'].items():
        _,line,m,p,typ,label=min(rows,key=lambda x:x[0])
        add_leg(g,{'type':typ,'marketKey':key,'player':player,'team':'Player','side':'over','point':line,'name':f'{player} Over {line:g} {label}',**base_leg(m,p)})
        q=1-p;add_leg(g,{'type':typ,'marketKey':key,'player':player,'team':'Player','side':'under','point':line,'name':f'{player} Under {line:g} {label}',**base_leg(m,q)})
    g.pop('_candidates',None)
    seen=set();out=[]
    for x in g['markets']:
        k=(x.get('marketKey'),x.get('player') or x.get('team'),x.get('side'),x.get('point'))
        if k not in seen:seen.add(k);out.append(x)
    g['markets']=out
    return g

def main():
    now=datetime.now(timezone.utc);limit=now+timedelta(days=14);games={};series_counts={}
    for series in SERIES:
        ms=fetch_series(series);series_counts[series]=len(ms);print(series,len(ms))
        for m in ms:
            info=matchup(m)
            if not info:continue
            close=m.get('close_time') or m.get('expected_expiration_time')
            try:
                dt=datetime.fromisoformat(str(close).replace('Z','+00:00')) if close else now
                if dt<now-timedelta(hours=8) or dt>limit:continue
            except:pass
            g=games.setdefault(info['key'],game_obj(info,m,now))
            if series=='KXNFLGAME':parse_moneyline(m,g,info)
            elif series=='KXNFLTOTAL':parse_total(m,g)
            elif series=='KXNFLSPREAD':parse_spread(m,g,info)
            else:parse_prop(m,g,series)
    out=[]
    for g in games.values():
        g=finalize(g)
        if g['markets']:out.append(g)
    out.sort(key=lambda g:g.get('commence_time') or '')
    payload={'source':'Kalshi','updated_at':now.isoformat(),'games':out,'raw_market_count':sum(series_counts.values()),'series_counts':series_counts}
    Path('data').mkdir(exist_ok=True);Path('data/kalshi-nfl.json').write_text(json.dumps(payload,separators=(',',':')))
    print('wrote',len(out),'games',sum(len(g['markets']) for g in out),'markets')

if __name__=='__main__':main()
