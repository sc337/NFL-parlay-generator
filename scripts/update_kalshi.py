import json,re,sys
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
BASES=['https://api.elections.kalshi.com/trade-api/v2/markets','https://external-api.kalshi.com/trade-api/v2/markets'];ESPN_SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
# Kalshi's actual live NFL series tickers. Keep these explicit: guessed aliases silently return empty sets.
SERIES=['KXNFLGAME','KXNFLSPREAD','KXNFLTOTAL','KXNFLTD','KXNFLRECYDS','KXNFLRSHYDS','KXNFLPASSYDS','KXNFLREC','KXNFLRSHATT','KXNFLPASSATT','KXNFLPASSCOMP','KXNFLPASSTDS','KXNFLPASSINT']
TEAM_CODES={'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills','CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns','DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers','HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs','LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LAR':'Los Angeles Rams','MIA':'Miami Dolphins','MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints','NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers','SEA':'Seattle Seahawks','SF':'San Francisco 49ers','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans','WAS':'Washington Commanders'};ALIASES={'JAC':'JAX','WSH':'WAS','LA':'LAR'};ALL_CODES={**TEAM_CODES,**{a:TEAM_CODES[b] for a,b in ALIASES.items()}}
PROP_SERIES={'KXNFLRECYDS':('receiving','player_reception_yds','receiving yards'),'KXNFLRSHYDS':('rushing','player_rush_yds','rushing yards'),'KXNFLPASSYDS':('passing','player_pass_yds','passing yards'),'KXNFLREC':('receiving','player_receptions','receptions'),'KXNFLRSHATT':('rushing','player_rush_attempts','rushing attempts'),'KXNFLPASSATT':('passing','player_pass_attempts','passing attempts'),'KXNFLPASSCOMP':('passing','player_pass_completions','passing completions'),'KXNFLPASSTDS':('passing','player_pass_tds','passing touchdowns'),'KXNFLPASSINT':('passing','player_pass_interceptions','passing interceptions')}
def fetch_json(url,timeout=20):
 req=Request(url,headers={'User-Agent':'NFL-parlay-generator/2.1','Accept':'application/json'});return json.loads(urlopen(req,timeout=timeout).read().decode())
def fetch_series(s):
 for base in BASES:
  try:return fetch_json(base+'?'+urlencode({'status':'open','limit':1000,'series_ticker':s,'mve_filter':'exclude'})).get('markets',[])
  except Exception as e:last=e
 print('WARN',s,last,file=sys.stderr);return []
def prob(m):
 vals=[]
 for k in ('yes_bid_dollars','yes_ask_dollars'):
  try:
   f=float(m.get(k));vals+=([f] if 0<f<1 else [])
  except:pass
 if len(vals)==2:return sum(vals)/2
 for k,div in [('last_price_dollars',1),('yes_bid',100),('yes_ask',100),('last_price',100)]:
  try:
   f=float(m.get(k))/div
   if 0<f<1:return f
  except:pass
 return vals[0] if vals else None
def american(p):return None if p is None or p<=0 or p>=1 else round(-100*p/(1-p)) if p>=.5 else round(100*(1-p)/p)
def quality(m,p):
 q=68
 try:
  v=float(m.get('volume') or m.get('volume_fp') or 0);oi=float(m.get('open_interest') or m.get('open_interest_fp') or 0);q+=5 if v>=1000 else 0;q+=5 if oi>=1000 else 0
 except:pass
 return min(90,q+(4 if .2<=p<=.8 else 0))
def matchup(m):
 e=str(m.get('event_ticker') or '').upper();mm=re.search(r'-\d{2}[A-Z]{3}\d{2}([A-Z]+)$',e)
 if not mm:return None
 tail=mm.group(1);pairs=[(a,b,an,bn) for a,an in ALL_CODES.items() for b,bn in ALL_CODES.items() if a!=b and a+b==tail]
 if not pairs:return None
 pairs.sort(key=lambda x:(x[0] not in TEAM_CODES)+(x[1] not in TEAM_CODES));a,b,an,bn=pairs[0];return {'codes':(a,b),'teams':(an,bn),'key':'|'.join(sorted((an,bn)))}
def event_date_from_ticker(m):
 mm=re.search(r'-(\d{2})([A-Z]{3})(\d{2})[A-Z]+$',str(m.get('event_ticker') or '').upper())
 try:return datetime.strptime('20'+mm.group(1)+mm.group(2)+mm.group(3),'%Y%b%d').date() if mm else None
 except:return None
def canonical_code(c):return ALIASES.get(str(c or '').upper(),str(c or '').upper())
def espn_schedule(day):
 try:raw=fetch_json(ESPN_SCOREBOARD+'?'+urlencode({'dates':day.strftime('%Y%m%d'),'limit':100}))
 except Exception as e:print('WARN ESPN',day,e,file=sys.stderr);return {}
 out={}
 for ev in raw.get('events',[]):
  try:
   comp=ev['competitions'][0];teams=[TEAM_CODES.get(canonical_code((c.get('team') or {}).get('abbreviation'))) for c in comp.get('competitors',[])];teams=[x for x in teams if x]
   if len(set(teams))!=2:continue
   status=(ev.get('status') or {}).get('type') or {};dt=datetime.fromisoformat(str(ev.get('date') or comp.get('date')).replace('Z','+00:00'));out['|'.join(sorted(set(teams)))]={'kickoff':dt,'state':str(status.get('state') or '').lower(),'completed':bool(status.get('completed')),'detail':status.get('detail') or status.get('shortDetail') or ''}
  except:pass
 return out
def game_obj(info,day):return {'id':'kalshi-'+re.sub(r'[^a-z0-9]+','-',info['key'].lower()).strip('-'),'away':info['teams'][0],'home':info['teams'][1],'commence_time':None,'event_date':day.isoformat(),'markets':[],'dataSource':'Kalshi','_candidates':{'totals':[],'spreads':[],'props':{}}}
def base_leg(m,p,side='yes'):
 try:
  ask=float(m.get('yes_ask_dollars')) if side=='yes' else 1-float(m.get('yes_bid_dollars'))
 except (ValueError,TypeError):ask=None
 return {'price':american(ask) if ask is not None and 0<ask<1 else None,'prob':p,'marketProbability':p,'source':'Kalshi','quoteSide':side,'quoteProbability':ask,'sourceQuality':quality(m,p)}
def parse_prop(m,g,s):
 p=prob(m);title=str(m.get('title') or '')
 if p is None:return
 if s=='KXNFLTD':
  mm=re.match(r'^(.+?):\s*(\d+)\+\s+touchdowns?$',title,re.I)
  if mm and int(mm.group(2))==1:g['markets'].append({'type':'td','marketKey':'player_anytime_td','player':mm.group(1).strip(),'team':'Player','side':'yes','name':mm.group(1).strip()+' anytime TD',**base_leg(m,p)})
  return
 if s not in PROP_SERIES:return
 typ,key,label=PROP_SERIES[s];aliases={
 'rushing yards':['rushing yards','rush yards'],'receiving yards':['receiving yards'],'passing yards':['passing yards','pass yards'],'receptions':['receptions'],'rushing attempts':['rushing attempts','rush attempts'],'passing attempts':['passing attempts','pass attempts'],'passing completions':['passing completions','completions'],'passing touchdowns':['passing touchdowns','pass touchdowns','touchdowns'],'passing interceptions':['passing interceptions','interceptions']}
 mm=None
 for wording in aliases.get(label,[label]):
  mm=re.match(r'^(.+?):\s*(\d+(?:\.\d+)?)\+\s+'+re.escape(wording)+r'$',title,re.I)
  if mm:break
 if not mm:return
 player=mm.group(1).strip();threshold=float(mm.group(2));line=max(.5,threshold-.5);g['_candidates']['props'].setdefault((player,key),[]).append((abs(p-.5),line,m,p,typ,label))
def finalize(g):
 if g['_candidates']['totals']:
  _,pt,m,p=min(g['_candidates']['totals'],key=lambda x:x[0]);g['markets'] += [{'type':'totals','marketKey':'totals','name':f'Over {pt:g}','team':'Game','side':'over','point':pt,**base_leg(m,p)},{'type':'totals','marketKey':'totals','name':f'Under {pt:g}','team':'Game','side':'under','point':pt,**base_leg(m,1-p,'no')}]
 if g['_candidates']['spreads']:
  _,line,team,other,m,p=min(g['_candidates']['spreads'],key=lambda x:x[0]);g['markets'] += [{'type':'spreads','marketKey':'spreads','name':f'{team} -{line:g}','team':team,'point':-line,**base_leg(m,p)},{'type':'spreads','marketKey':'spreads','name':f'{other} +{line:g}','team':other,'point':line,**base_leg(m,1-p,'no')}]
 for (player,key),rows in g['_candidates']['props'].items():
  _,line,m,p,typ,label=min(rows,key=lambda x:x[0]);g['markets'] += [{'type':typ,'marketKey':key,'player':player,'team':'Player','side':'over','point':line,'name':f'{player} Over {line:g} {label}',**base_leg(m,p)},{'type':typ,'marketKey':key,'player':player,'team':'Player','side':'under','point':line,'name':f'{player} Under {line:g} {label}',**base_leg(m,1-p,'no')}]
 g.pop('_candidates',None);seen=set();out=[]
 for x in g['markets']:
  k=(x.get('marketKey'),x.get('player') or x.get('team'),x.get('side'),x.get('point'))
  if k not in seen and x.get('price') is not None:seen.add(k);out.append(x)
 g['markets']=out;return g
def main():
 now=datetime.now(timezone.utc);limit=now+timedelta(days=14);games={};counts={}
 for s in SERIES:
  ms=fetch_series(s);counts[s]=len(ms);print(s,len(ms))
  for m in ms:
   info=matchup(m);day=event_date_from_ticker(m)
   if not info or not day:continue
   ds=datetime(day.year,day.month,day.day,tzinfo=timezone.utc)
   if ds>limit or ds<now-timedelta(days=1):continue
   g=games.setdefault(info['key'],game_obj(info,day));p=prob(m)
   if s=='KXNFLGAME' and p is not None:
    suffix=str(m.get('ticker') or '').upper().rsplit('-',1)[-1];team=next((name for code,name in ALL_CODES.items() if suffix==code),None)
    if team in info['teams']:g['markets'].append({'type':'h2h','marketKey':'h2h','name':team+' ML','team':team,**base_leg(m,p)})
   elif s=='KXNFLTOTAL' and p is not None:
    mm=re.search(r'over\s+(\d+(?:\.\d+)?)\s+points',str(m.get('title') or ''),re.I)
    if mm:g['_candidates']['totals'].append((abs(p-.5),float(mm.group(1)),m,p))
   elif s=='KXNFLSPREAD' and p is not None:
    mm=re.search(r'(.+?)\s+wins by over\s+(\d+(?:\.\d+)?)\s+points',str(m.get('title') or ''),re.I);suffix=str(m.get('ticker') or '').upper().rsplit('-',1)[-1]
    if mm:
     code=next((c for c in ALL_CODES if suffix.startswith(c) and ALL_CODES[c] in info['teams']),None)
     if code:
      team=ALL_CODES[code];other=info['teams'][0] if info['teams'][1]==team else info['teams'][1];g['_candidates']['spreads'].append((abs(p-.5),float(mm.group(2)),team,other,m,p))
   else:parse_prop(m,g,s)
 schedules={}
 for g in games.values():
  day=datetime.fromisoformat(g['event_date']).date();schedules.setdefault(day,espn_schedule(day))
 out=[];started=unmatched=0
 for g in games.values():
  day=datetime.fromisoformat(g['event_date']).date();ev=schedules.get(day,{}).get('|'.join(sorted((g['away'],g['home']))))
  if not ev or not ev.get('kickoff'):unmatched+=1;continue
  ko=ev['kickoff']
  if ev.get('completed') or ev.get('state')!='pre' or ko<=now:started+=1;continue
  if ko>limit:continue
  g['commence_time']=ko.isoformat().replace('+00:00','Z');g['game_status']='pre';g['status_detail']=ev.get('detail') or '';g=finalize(g)
  if g['markets']:out.append(g)
 out.sort(key=lambda x:x['commence_time']);payload={'source':'Kalshi','updated_at':now.isoformat(),'games':out,'raw_market_count':sum(counts.values()),'series_counts':counts,'filters':{'started_or_live_removed':started,'espn_unmatched_removed':unmatched}}
 Path('data').mkdir(exist_ok=True);Path('data/kalshi-nfl.json').write_text(json.dumps(payload,separators=(',',':')));print('wrote',len(out),'games',sum(len(g['markets']) for g in out),'markets')
if __name__=='__main__':main()