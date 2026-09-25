"""Attach only unambiguous scheduled games to market rows; unresolved rows are not pregame picks."""
import json,re
from pathlib import Path
from datetime import datetime,timezone

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

def attach_ncaaf():
 path=Path('data/kalshi-ncaaf.json');d=json.loads(path.read_text());rows=d['markets'];days={day for m in rows if (day:=date_code(m.get('event_ticker'))[0])}
 events=scoreboard('football/college-football',days)
 for m in rows:
  day,_=date_code(m.get('event_ticker'))
  if not day:continue
  group=[r for r in rows if r.get('event_ticker','').split('-',1)[-1]==m['event_ticker'].split('-',1)[-1] and r['kind']=='moneyline']
  names={key(r.get('title','').removesuffix(' wins')) for r in group}
  if len(names)!=2:continue
  matches=[]
  for event in events:
   comps=(event.get('competitions') or [{}])[0].get('competitors',[])
   if len(comps)!=2:continue
   teamnames=[{key(x) for x in (c.get('team') or {}).values() if isinstance(x,str) and len(x)>2} for c in comps]
   if not all(any(n in variants for variants in teamnames) for n in names):continue
   start=event.get('date')
   if start and abs((datetime.fromisoformat(start.replace('Z','+00:00')).date()-day).days)<=1:matches.append(event)
  if len(matches)!=1:continue
  ev=matches[0];m['game_id']=ev['id'];m['game_time']=ev['date'];m['game_label']=ev.get('name') or ev.get('shortName');m['game_status']=(ev.get('status') or {}).get('type',{}).get('state')
 path.write_text(json.dumps(d,indent=2));print('NCAAF matched',sum(bool(m.get('game_time')) for m in rows),'of',len(rows))

if __name__=='__main__':
 import sys
 attach_ncaaf() if '--ncaaf' in sys.argv else attach_mlb()
