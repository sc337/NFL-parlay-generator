"""Attach only unambiguous scheduled games to market rows; unresolved rows are not pregame picks."""
import json,re
from pathlib import Path
from datetime import datetime,timezone,date,timedelta
from zoneinfo import ZoneInfo

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
  # Kalshi's MLB ticker uses the Eastern game date. A UTC +/- one-day window
  # includes the previous final and the next day's game for the same teams.
  games=[g for g in ctx['games'] if g.get('status')=='Preview'
         and datetime.fromisoformat(g['gameDate'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date()==day
         and all(key(team) in key(g.get(side)) for team,side in ((away,'away'),(home,'home')))]
  if len(games)!=1:continue
  g=games[0];m['game_id']=str(g['gamePk']);m['game_time']=g['gameDate'];m['game_label']=g['away']+' at '+g['home'];m['game_status']=g.get('status')
 path.write_text(json.dumps(d,indent=2));print('MLB matched',sum(bool(m.get('game_time')) for m in d['markets']),'of',len(d['markets']))


def scoreboard(sport,days):
 import urllib.request
 out=[]
 for day in sorted(days):
  # ESPN silently caps college responses at 25 when limit exceeds 500.
  # Fetch FBS and FCS separately: comma-separated groups produce empty events.
  for group in ('80','81') if sport=='football/college-football' else ('',):
   url=f'https://site.api.espn.com/apis/site/v2/sports/{sport}/scoreboard?dates={day.strftime("%Y%m%d")}&limit=500'+('&groups='+group if group else '')
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'sports-dashboard/1.0'}),timeout=25) as response:d=json.load(response)
    out+=[event for event in d.get('events',[]) if event.get('id')]
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
         'miamifl':'miami','miamioh':'miamiohio','northernill':'northernillinois','southernmiss':'southernmississippi','appst':'appalachianst','ulmonroe':'louisianamonroe','ul':'louisiana','nmsu':'newmexicost','ncst':'northcarolinast','samhoustonst':'samhouston','thecitadel':'citadel','universityatalbany':'albany','ualbany':'albany','centralconnecticutst':'centralconnecticut','nichollsst':'nicholls','southernuniversity':'southern','tennesseemartin':'utmartin','southeasternlouisiana':'selouisiana'}.get(s,s)

def college_matches(names, day, events):
 matches={}
 if len(names)!=2:return []
 a,b=sorted(names)
 for event in events:
  comp=(event.get('competitions') or [{}])[0]
  comps=comp.get('competitors',[])
  if len(comps)!=2 or comp.get('timeValid') is False:continue
  teamnames=[{college_name(c.get('team',{}).get(field)) for field in
              ('location','displayName','shortDisplayName','abbreviation')} for c in comps]
  if not (a in teamnames[0] and b in teamnames[1] or b in teamnames[0] and a in teamnames[1]):continue
  try:start=datetime.fromisoformat(event['date'].replace('Z','+00:00'))
  except (KeyError,TypeError,ValueError,AttributeError):continue
  if start.tzinfo and start.astimezone(ZoneInfo('America/New_York')).date()==day:
   # Multiple providers may describe the same game. Prefer ESPN's context ID;
   # genuinely conflicting kickoff times remain ambiguous and ineligible.
   matches.setdefault(start.timestamp(),event)
 return list(matches.values())

def attach_ncaaf():
 path=Path('data/kalshi-ncaaf.json');d=json.loads(path.read_text());rows=d['markets'];days={day for m in rows if (day:=date_code(m.get('event_ticker'))[0])}
 today=datetime.now(ZoneInfo('America/New_York')).date()
 upcoming=sorted(day for day in days if today<=day<=today+timedelta(days=14))
 events=scoreboard('football/college-football',upcoming)
 events=list({event.get('id'):event for event in events if event.get('id')}.values())
 groups={}
 for row in rows:
  if row.get('kind')=='moneyline':groups.setdefault(row.get('event_ticker','').split('-',1)[-1],[]).append(row)
 unresolved={day for group in groups.values() if (day:=date_code(group[0].get('event_ticker'))[0]) in upcoming
             and len(college_matches({college_name(r.get('title','').removesuffix(' wins')) for r in group},day,events))!=1}
 # A partial ESPN response is not a complete schedule. Supplement only dates
 # with unresolved matchups; preserve the same exact-name/date/time checks.
 if unresolved:events+=ncaa_scoreboard(sorted(unresolved))
 for m in rows:
  day,_=date_code(m.get('event_ticker'))
  if not day:continue
  group=groups.get(m['event_ticker'].split('-',1)[-1],[])
  names={college_name(r.get('title','').removesuffix(' wins')) for r in group}
  if len(names)!=2:continue
  matches=college_matches(names,day,events)
  m['schedule_status']='verified' if len(matches)==1 else 'unmatched'
  if len(matches)!=1:
   for field in ('game_id','game_time','game_label','game_status','game_source'):m.pop(field,None)
   continue
  ev=matches[0];m['game_id']=ev['id'];m['game_time']=ev['date'];m['game_label']=ev.get('name') or ev.get('shortName');m['game_status']=(ev.get('status') or {}).get('type',{}).get('state');m['game_source']=ev.get('source') or 'ESPN'
 matched=sum(bool(m.get('game_time')) for m in rows)
 d['schedule_coverage']={'verified_quotes':matched,'unmatched_quotes':len(rows)-matched,
     'checked_at':datetime.now(timezone.utc).isoformat(),'policy':'Exact teams and Eastern event date; kickoff must be verified'}
 path.write_text(json.dumps(d,indent=2));print('NCAAF matched',matched,'of',len(rows))

if __name__=='__main__':
 import sys
 attach_ncaaf() if '--ncaaf' in sys.argv else attach_mlb()
