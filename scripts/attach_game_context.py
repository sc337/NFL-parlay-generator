"""Attach only unambiguous scheduled games to market rows; unresolved rows are not pregame picks."""
import json,re
from pathlib import Path
from datetime import datetime,timezone,date,timedelta

MLB={'AZ':'Diamondbacks','ATL':'Braves','BAL':'Orioles','BOS':'Red Sox','CHC':'Cubs','CHW':'White Sox','CWS':'White Sox','CIN':'Reds','CLE':'Guardians','COL':'Rockies','DET':'Tigers','HOU':'Astros','KC':'Royals','LAA':'Angels','LAD':'Dodgers','MIA':'Marlins','MIL':'Brewers','MIN':'Twins','NYM':'Mets','NYY':'Yankees','OAK':'Athletics','ATH':'Athletics','PHI':'Phillies','PIT':'Pirates','SD':'Padres','SEA':'Mariners','SF':'Giants','STL':'Cardinals','TB':'Rays','TEX':'Rangers','TOR':'Blue Jays','WSH':'Nationals'}
def key(s):return re.sub('[^a-z0-9]','',str(s or '').lower())
def date_code(ticker):
 m=re.search(r'-(\d{2}[A-Z]{3}\d{2})(?:\d{4})?([A-Z]+?)(?:G\d+)?$',ticker or '')
 if not m:return None,None
 try:return datetime.strptime(m[1],'%y%b%d').date(),m[2]
 except ValueError:return None,None

def attach_mlb():
 path=Path('data/kalshi-mlb.json');d=json.loads(path.read_text());ctx=json.loads(Path('data/mlb-context.json').read_text())
 for m in d['markets']:
  day,codes=date_code(m.get('event_ticker'));matches=[]
  if not day or not codes:continue
  for a in MLB:
   b=codes[len(a):] if codes.startswith(a) else ''
   if b in MLB and a!=b:matches.append((MLB[a],MLB[b]))
  if len(matches)!=1:continue
  away,home=matches[0]
  # Match the scheduled local game date or following UTC date.
  games=[g for g in ctx['games'] if all(key(team) in key(g.get(side)) for team,side in ((away,'away'),(home,'home'))) and abs((datetime.fromisoformat(g['gameDate'].replace('Z','+00:00')).date()-day).days)<=1]
  if len(games)!=1:continue
  g=games[0];m['game_id']=str(g['gamePk']);m['game_time']=g['gameDate'];m['game_label']=g['away']+' at '+g['home'];m['game_status']=g.get('status')
 path.write_text(json.dumps(d,indent=2));print('MLB matched',sum(bool(m.get('game_time')) for m in d['markets']),'of',len(d['markets']))


def scoreboard(sport,days):
 import urllib.request
 out=[]
 for day in sorted(days):
  url=f'https://site.api.espn.com/apis/site/v2/sports/{sport}/scoreboard?dates={day.strftime("%Y%m%d")}&limit=1000'
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'sports-dashboard/1.0'}),timeout=25) as response:d=json.load(response)
   out+=d.get('events',[])
  except Exception as e:print('schedule unavailable',sport,day,e)
 return out

def ncaa_scoreboard(days):
 """Use the public NCAA scoreboard mirror when ESPN's college feed is unavailable."""
 import urllib.request,time
 if not days:return []
 weeks=set()
 for day in days:
  last_august_saturday=date(day.year,8,31)
  while last_august_saturday.weekday()!=5:last_august_saturday-=timedelta(days=1)
  week=max(0,(day-last_august_saturday).days//7)
  # Friday games often appear in the following Saturday's scoreboard week.
  weeks.update((week,week+1))
 out={}
 for division in ('fbs','fcs'):
  for week in sorted(weeks):
   url=f'https://ncaa-api.henrygd.me/scoreboard/football/{division}/{days[0].year}/{week:02d}/all-conf'
   try:
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as response:raw=json.load(response)
   except Exception as e:
    print('NCAA scoreboard unavailable',division,week,e);continue
   for item in raw.get('games') or []:
    game=item.get('game') or {};gid=game.get('gameID');epoch=game.get('startTimeEpoch')
    if not gid or not epoch:continue
    try:start=datetime.fromtimestamp(int(epoch),timezone.utc).isoformat()
    except (TypeError,ValueError,OverflowError):continue
    sides=[game.get('away') or {},game.get('home') or {}]
    names=[(side.get('names') or {}).get('short') for side in sides]
    if not all(names):continue
    competitors=[{'team':{'displayName':name,'shortDisplayName':name}} for name in names]
    out[str(gid)]={'id':str(gid),'date':start,'name':names[0]+' at '+names[1],
                   'status':{'type':{'state':game.get('gameState') or ''}},
                   'competitions':[{'competitors':competitors}], 'source':'NCAA'}
   time.sleep(.22)
 return list(out.values())

def college_name(s):
 s=key(s).replace('state','st').replace('saint','st')
 return {'armywestpoint':'army','westernky':'westernkentucky','easternky':'easternkentucky',
         'miamifl':'miami','miamioh':'miamiohio'}.get(s,s)

def attach_ncaaf():
 path=Path('data/kalshi-ncaaf.json');d=json.loads(path.read_text());rows=d['markets'];days={day for m in rows if (day:=date_code(m.get('event_ticker'))[0])}
 upcoming=sorted(day for day in days if datetime.now(timezone.utc).date()<=day<=datetime.now(timezone.utc).date()+timedelta(days=14))
 events=scoreboard('football/college-football',upcoming)
 if not events:events=ncaa_scoreboard(upcoming)
 events=list({event.get('id'):event for event in events if event.get('id')}.values())
 for m in rows:
  day,_=date_code(m.get('event_ticker'))
  if not day:continue
  group=[r for r in rows if r.get('event_ticker','').split('-',1)[-1]==m['event_ticker'].split('-',1)[-1] and r['kind']=='moneyline']
  names={college_name(r.get('title','').removesuffix(' wins')) for r in group}
  if len(names)!=2:continue
  matches=[]
  for event in events:
   comps=(event.get('competitions') or [{}])[0].get('competitors',[])
   if len(comps)!=2:continue
   teamnames=[{college_name(x) for x in (c.get('team') or {}).values() if isinstance(x,str) and len(x)>2} for c in comps]
   if not all(any(n in variants for variants in teamnames) for n in names):continue
   start=event.get('date')
   if start and abs((datetime.fromisoformat(start.replace('Z','+00:00')).date()-day).days)<=1:matches.append(event)
  if len(matches)!=1:continue
  ev=matches[0];m['game_id']=ev['id'];m['game_time']=ev['date'];m['game_label']=ev.get('name') or ev.get('shortName');m['game_status']=(ev.get('status') or {}).get('type',{}).get('state');m['game_source']=ev.get('source') or 'ESPN'
 path.write_text(json.dumps(d,indent=2));print('NCAAF matched',sum(bool(m.get('game_time')) for m in rows),'of',len(rows))

if __name__=='__main__':
 import sys
 attach_ncaaf() if '--ncaaf' in sys.argv else attach_mlb()
