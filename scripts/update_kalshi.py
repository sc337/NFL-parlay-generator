import json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASES=[
    'https://api.elections.kalshi.com/trade-api/v2/markets',
    'https://external-api.kalshi.com/trade-api/v2/markets',
]
SERIES=[
    'KXNFLGAME','KXNFLSERIES','KXNFLS PREAD'.replace(' ',''),'KXNFLTOTAL',
    'KXNFLTD','KXNFLRECYDS','KXNFLRUSHYDS','KXNFLPASSYDS','KXNFLRECEPTIONS'
]
TEAM_CODES={
'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills','CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns','DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers','HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs','LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LAR':'Los Angeles Rams','MIA':'Miami Dolphins','MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints','NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers','SEA':'Seattle Seahawks','SF':'San Francisco 49ers','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans','WAS':'Washington Commanders'
}

def fetch_json(url, timeout=20):
    req=Request(url, headers={'User-Agent':'NFL-parlay-generator/1.0','Accept':'application/json'})
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

def fetch_series(series):
    last=None
    for base in BASES:
        try:
            q=urlencode({'status':'open','limit':1000,'series_ticker':series})
            data=fetch_json(base+'?'+q)
            return data.get('markets',[]) if isinstance(data,dict) else []
        except Exception as e:
            last=e
    print(f'WARN {series}: {last}', file=sys.stderr)
    return []

def price_prob(m):
    vals=[]
    for k in ('yes_bid_dollars','yes_ask_dollars','last_price_dollars'):
        v=m.get(k)
        try:
            if v is not None:
                f=float(v)
                if 0 < f < 1: vals.append(f)
        except: pass
    if not vals:
        for k in ('yes_bid','yes_ask','last_price'):
            v=m.get(k)
            try:
                if v is not None:
                    f=float(v)/100
                    if 0 < f < 1: vals.append(f)
            except: pass
    if not vals: return None
    if len(vals)>=2: return sum(vals[:2])/2
    return vals[0]

def american(p):
    if not p or p<=0 or p>=1: return None
    return round(-100*p/(1-p)) if p>=.5 else round(100*(1-p)/p)

def text(m):
    return ' '.join(str(m.get(k) or '') for k in ('ticker','title','subtitle','yes_sub_title','no_sub_title','event_ticker')).strip()

def team_hits(s):
    u=s.upper()
    hits=[]
    for code,name in TEAM_CODES.items():
        if re.search(rf'(?<![A-Z]){re.escape(code)}(?![A-Z])',u) or name.upper() in u:
            hits.append(name)
    return list(dict.fromkeys(hits))

def game_key(teams): return '|'.join(sorted(teams))

def classify(m):
    s=text(m)
    sl=s.lower()
    ticker=str(m.get('ticker') or '')
    teams=team_hits(s)
    p=price_prob(m); odds=american(p)
    if odds is None: return None,None
    source_quality=70
    vol=float(m.get('volume') or 0)
    oi=float(m.get('open_interest') or 0)
    if vol>=1000: source_quality+=5
    if vol>=10000: source_quality+=5
    if oi>=1000: source_quality+=5
    source_quality=min(90,source_quality)

    # Game winner / moneyline-style contracts.
    if ('KXNFLGAME' in ticker.upper() or 'winner' in sl or 'win' in sl) and teams:
        team=teams[0]
        leg={'type':'h2h','marketKey':'h2h','name':team+' ML','team':team,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':source_quality}
        return teams,leg

    # Totals.
    if 'total' in sl or 'KXNFLTOTAL' in ticker.upper():
        mm=re.search(r'\b(over|under)\s*(\d+(?:\.\d+)?)',sl)
        if not mm:
            mm=re.search(r'(\d+(?:\.\d+)?)\s*(?:points?)',sl)
            side='over' if 'over' in sl else ('under' if 'under' in sl else None)
            point=float(mm.group(1)) if mm and side else None
        else:
            side=mm.group(1); point=float(mm.group(2))
        if point is not None and side:
            return teams,{'type':'totals','marketKey':'totals','name':side.title()+' '+str(point).rstrip('0').rstrip('.'),'team':'Game','side':side,'point':point,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':source_quality}

    # Spreads.
    if 'spread' in sl or 'KXNFLSPREAD' in ticker.upper():
        mm=re.search(r'([+-]?\d+(?:\.\d+)?)',sl)
        if teams and mm:
            point=float(mm.group(1)); team=teams[0]
            return teams,{'type':'spreads','marketKey':'spreads','name':f"{team} {point:+g}",'team':team,'point':point,'price':odds,'prob':p,'source':'Kalshi','sourceQuality':source_quality}

    # Player props when Kalshi wording is explicit enough to normalize safely.
    prop_specs=[
      ('receiving yards','receiving','player_reception_yds'),('rushing yards','rushing','player_rush_yds'),('passing yards','passing','player_pass_yds'),('receptions','receiving','player_receptions'),('touchdown','td','player_anytime_td')]
    for label,typ,key in prop_specs:
        if label in sl or key.upper().replace('PLAYER_','') in ticker.upper():
            pm=re.search(r'([A-Z][A-Za-z\.\'’-]+(?:\s+[A-Z][A-Za-z\.\'’-]+){1,3})',s)
            player=pm.group(1).strip() if pm else None
            if not player: return None,None
            if typ=='td':
                return teams,{'type':'td','marketKey':'player_anytime_td','player':player,'team':'Player','side':'yes','name':player+' anytime TD','price':odds,'prob':p,'source':'Kalshi','sourceQuality':source_quality}
            mm=re.search(r'\b(over|under|more than|less than|at least|fewer than)\s*(\d+(?:\.\d+)?)',sl)
            if not mm: return None,None
            raw=mm.group(1); side='under' if raw in ('under','less than','fewer than') else 'over'; point=float(mm.group(2))
            return teams,{'type':typ,'marketKey':key,'player':player,'team':'Player','side':side,'point':point,'name':f"{player} {side.title()} {point:g} {label}",'price':odds,'prob':p,'source':'Kalshi','sourceQuality':source_quality}
    return None,None

def main():
    raw=[]
    for s in SERIES:
        ms=fetch_series(s)
        print(f'{s}: {len(ms)} markets')
        raw.extend(ms)
    uniq={m.get('ticker') or str(i):m for i,m in enumerate(raw)}
    games={}
    orphan=[]
    now=datetime.now(timezone.utc)
    for m in uniq.values():
        teams,leg=classify(m)
        if not leg: continue
        # Prefer matchup text if two teams are visible.
        if teams and len(teams)>=2:
            pair=teams[:2]
            k=game_key(pair)
            g=games.setdefault(k,{'id':'kalshi-'+re.sub(r'[^a-z0-9]+','-',k.lower()).strip('-'),'away':pair[0],'home':pair[1],'commence_time':m.get('close_time') or m.get('expiration_time') or now.isoformat(),'markets':[],'dataSource':'Kalshi'})
            g['markets'].append(leg)
        else:
            orphan.append((m,leg,teams or []))
    # Attach one-team/player contracts to a unique game containing that team when possible.
    for m,leg,teams in orphan:
        matches=[]
        mt=team_hits(text(m))
        for g in games.values():
            if mt and any(t in (g['away'],g['home']) for t in mt): matches.append(g)
        if len(matches)==1: matches[0]['markets'].append(leg)
    # Dedupe legs.
    for g in games.values():
        seen=set(); out=[]
        for x in g['markets']:
            k=(x.get('marketKey') or x.get('type'),x.get('player') or x.get('team'),x.get('side'),x.get('point'))
            if k in seen: continue
            seen.add(k); out.append(x)
        g['markets']=out
    payload={'source':'Kalshi','updated_at':now.isoformat(),'games':[g for g in games.values() if g['markets']], 'raw_market_count':len(uniq)}
    Path('data').mkdir(exist_ok=True)
    Path('data/kalshi-nfl.json').write_text(json.dumps(payload,separators=(',',':')))
    print(f"wrote {len(payload['games'])} games / {sum(len(g['markets']) for g in payload['games'])} normalized markets")

if __name__=='__main__': main()
