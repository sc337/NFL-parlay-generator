import json, re, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASES=['https://api.elections.kalshi.com/trade-api/v2/markets','https://external-api.kalshi.com/trade-api/v2/markets']
SERIES=['KXNFLGAME','KXNFLSERIES','KXNFLSPREAD','KXNFLTOTAL','KXNFLTD','KXNFLRECYDS','KXNFLRUSHYDS','KXNFLPASSYDS','KXNFLRECEPTIONS']
TEAM_CODES={'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills','CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns','DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers','HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs','LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LAR':'Los Angeles Rams','MIA':'Miami Dolphins','MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints','NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers','SEA':'Seattle Seahawks','SF':'San Francisco 49ers','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans','WAS':'Washington Commanders'}

def fetch_json(url,timeout=20):
    req=Request(url,headers={'User-Agent':'NFL-parlay-generator/1.0','Accept':'application/json'})
    with urlopen(req,timeout=timeout) as r:return json.loads(r.read().decode())

def fetch_series(series):
    err=None
    for base in BASES:
        try:
            q=urlencode({'status':'open','limit':1000,'series_ticker':series})
            d=fetch_json(base+'?'+q)
            return d.get('markets',[]) if isinstance(d,dict) else []
        except Exception as e:err=e
    print('WARN',series,err,file=sys.stderr);return []

def price_prob(m):
    vals=[]
    for k in ('yes_bid_dollars','yes_ask_dollars','last_price_dollars'):
        try:
            f=float(m.get(k));
            if 0<f<1:vals.append(f)
        except:pass
    if not vals:
        for k in ('yes_bid','yes_ask','last_price'):
            try:
                f=float(m.get(k))/100
                if 0<f<1:vals.append(f)
            except:pass
    return sum(vals[:2])/min(2,len(vals)) if vals else None

def american(p):return None if not p or p<=0 or p>=1 else round(-100*p/(1-p)) if p>=.5 else round(100*(1-p)/p)
def text(m):return ' '.join(str(m.get(k) or '') for k in ('ticker','event_ticker','title','subtitle','yes_sub_title','no_sub_title','rules_primary')).strip()

def team_hits(s):
    u=s.upper();hits=[]
    aliases={'JAC':'JAX','LA':'LAR','WSH':'WAS'}
    for raw,name in TEAM_CODES.items():
        codes=[raw]+[a for a,b in aliases.items() if b==raw]
        if any(re.search(rf'(?<![A-Z]){c}(?![A-Z])',u) for c in codes) or name.upper() in u:hits.append(name)
    return list(dict.fromkeys(hits))

def matchup_from_ticker(m):
    blob=(str(m.get('event_ticker') or '')+'-'+str(m.get('ticker') or '')).upper()
    # Kalshi NFL tickers commonly concatenate two team abbreviations in an event segment.
    code_items=sorted(TEAM_CODES.items(),key=lambda x:len(x[0]),reverse=True)
    aliases={'JAC':'JAX','LA':'LAR','WSH':'WAS'}
    expanded={**TEAM_CODES,**{a:TEAM_CODES[b] for a,b in aliases.items()}}
    for a,an in expanded.items():
        for b,bn in expanded.items():
            if a==b:continue
            if a+b in blob:return [an,bn]
    return None

def game_key(t):return '|'.join(sorted(t))

def quality(m):
    q=68
    try:
        if float(m.get('volume') or m.get('volume_fp') or 0)>=1000:q+=5
        if float(m.get('open_interest') or m.get('open_interest_fp') or 0)>=1000:q+=5
    except:pass
    return min(90,q)

def classify(m):
    s=text(m);sl=s.lower();tick=str(m.get('ticker') or '').upper();teams=team_hits(s) or matchup_from_ticker(m) or []
    p=price_prob(m);odds=american(p)
    if odds is None:return teams,None
    sq=quality(m)
    if tick.startswith('KXNFLGAME') or ' nfl game ' in (' '+sl+' ') or 'winner' in sl:
        tm=None
        for t in teams:
            if t.lower() in sl or t.split()[-1].lower() in sl:tm=t;break
        if tm is None and teams:tm=teams[-1]
        if tm:return teams,{'type':'h2h','marketKey':'h2h','name':tm+' ML','team':tm,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':sq}
    if tick.startswith('KXNFLTOTAL') or 'total' in sl:
        mm=re.search(r'(?:over|above|more than)\s*(\d+(?:\.\d+)?)',sl)
        if mm:
            pt=float(mm.group(1));return teams,{'type':'totals','marketKey':'totals','name':f'Over {pt:g}','team':'Game','side':'over','point':pt,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':sq}
    if tick.startswith('KXNFLSPREAD') or 'spread' in sl:
        tm=teams[-1] if teams else None;mm=re.search(r'([+-]?\d+(?:\.\d+)?)',sl)
        if tm and mm:
            pt=float(mm.group(1));return teams,{'type':'spreads','marketKey':'spreads','name':f'{tm} {pt:+g}','team':tm,'point':pt,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':sq}
    prop_specs=[('KXNFLPASSYDS','passing','player_pass_yds','passing yards'),('KXNFLRUSHYDS','rushing','player_rush_yds','rushing yards'),('KXNFLRECYDS','receiving','player_reception_yds','receiving yards'),('KXNFLRECEPTIONS','receiving','player_receptions','receptions')]
    hit=next((x for x in prop_specs if tick.startswith(x[0])),None)
    if hit:
        pm=re.search(r'([A-Z][A-Za-z.\'’-]+(?:\s+[A-Z][A-Za-z.\'’-]+){1,3})',s);mm=re.search(r'(?:over|above|more than|at least)\s*(\d+(?:\.\d+)?)',sl)
        if pm and mm:
            pl=pm.group(1);pt=float(mm.group(1));return teams,{'type':hit[1],'marketKey':hit[2],'player':pl,'team':'Player','side':'over','point':pt,'name':f'{pl} Over {pt:g} {hit[3]}','price':odds,'prob':p,'source':'Kalshi','sourceQuality':sq}
    if tick.startswith('KXNFLTD'):
        pm=re.search(r'([A-Z][A-Za-z.\'’-]+(?:\s+[A-Z][A-Za-z.\'’-]+){1,3})',s)
        if pm:
            pl=pm.group(1);return teams,{'type':'td','marketKey':'player_anytime_td','player':pl,'team':'Player','side':'yes','name':pl+' anytime TD','price':odds,'prob':p,'source':'Kalshi','sourceQuality':sq}
    return teams,None

def main():
    by_series={};raw=[]
    for series in SERIES:
        ms=fetch_series(series);by_series[series]=ms;raw.extend(ms);print(series,len(ms))
    uniq={m.get('ticker') or f'row-{i}':m for i,m in enumerate(raw)};games={};orphans=[];now=datetime.now(timezone.utc)
    for m in uniq.values():
        teams,leg=classify(m)
        if not leg:continue
        if len(teams)>=2:
            pair=teams[:2];k=game_key(pair);g=games.setdefault(k,{'id':'kalshi-'+re.sub(r'[^a-z0-9]+','-',k.lower()).strip('-'),'away':pair[0],'home':pair[1],'commence_time':m.get('close_time') or m.get('expected_expiration_time') or now.isoformat(),'markets':[],'dataSource':'Kalshi'});g['markets'].append(leg)
        else:orphans.append((m,leg,teams))
    for m,leg,teams in orphans:
        candidates=[]
        for g in games.values():
            if teams and any(t in (g['away'],g['home']) for t in teams):candidates.append(g)
        if len(candidates)==1:candidates[0]['markets'].append(leg)
    for g in games.values():
        seen=set();out=[]
        for x in g['markets']:
            k=(x.get('marketKey') or x.get('type'),x.get('player') or x.get('team'),x.get('side'),x.get('point'))
            if k not in seen:seen.add(k);out.append(x)
        g['markets']=out
    samples=[]
    for series,ms in by_series.items():
        for m in ms[:3]:
            samples.append({'series':series,'ticker':m.get('ticker'),'event_ticker':m.get('event_ticker'),'title':m.get('title'),'subtitle':m.get('subtitle'),'yes_sub_title':m.get('yes_sub_title'),'no_sub_title':m.get('no_sub_title'),'yes_bid_dollars':m.get('yes_bid_dollars'),'yes_ask_dollars':m.get('yes_ask_dollars'),'last_price_dollars':m.get('last_price_dollars')})
    payload={'source':'Kalshi','updated_at':now.isoformat(),'games':[g for g in games.values() if g['markets']],'raw_market_count':len(uniq),'series_counts':{k:len(v) for k,v in by_series.items()},'debug_samples':samples}
    Path('data').mkdir(exist_ok=True);Path('data/kalshi-nfl.json').write_text(json.dumps(payload,separators=(',',':')))
    print('wrote',len(payload['games']),'games',sum(len(g['markets']) for g in payload['games']),'markets')

if __name__=='__main__':main()
