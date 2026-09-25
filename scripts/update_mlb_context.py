import json, re, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
import csv, io
import unicodedata

UA={'User-Agent':'Mozilla/5.0 sports-dashboard'}
BASE='https://statsapi.mlb.com/api/v1'

def name_key(name):
 return ''.join(c for c in unicodedata.normalize('NFKD',str(name or '')).casefold() if c.isalnum() and not unicodedata.combining(c))

def get(url):
 req=urllib.request.Request(url,headers=UA)
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)

def season_stats(pid,group):
 try:
  d=get(f'{BASE}/people/{pid}/stats?stats=season&group={group}')
  return (d.get('stats',[{}])[0].get('splits') or [{}])[0].get('stat',{})
 except:return {}

def statcast_recent(pid,days=30):
 try:
  end=datetime.now(timezone.utc).date(); start=end-timedelta(days=days)
  url=f'https://baseballsavant.mlb.com/leaderboard/services/statcast-search/csv?type=pitcher&player_type=pitcher&playerid={pid}&game_date_gt={start.isoformat()}&game_date_lt={end.isoformat()}'
  req=urllib.request.Request(url,headers=UA)
  with urllib.request.urlopen(req,timeout=35) as r: text=r.read().decode('utf-8','ignore')
  rows=list(csv.DictReader(io.StringIO(text)))
  if not rows:return {}
  pitches=len(rows); bf=len({(x.get('game_pk'),x.get('at_bat_number')) for x in rows if x.get('at_bat_number')})
  ks=sum(1 for x in rows if x.get('events')=='strikeout'); bbs=sum(1 for x in rows if x.get('events') in ('walk','intent_walk'))
  ev=[float(x['launch_speed']) for x in rows if x.get('launch_speed') not in ('',None)]
  hard=sum(1 for x in rows if x.get('launch_speed') not in ('',None) and float(x['launch_speed'])>=95)
  whiffs=sum(1 for x in rows if x.get('description') in ('swinging_strike','swinging_strike_blocked','missed_bunt'))
  swings=sum(1 for x in rows if x.get('description') in ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','missed_bunt'))
  return {'days':days,'pitches':pitches,'battersFaced':bf,'kRate':round(ks/bf,4) if bf else None,'bbRate':round(bbs/bf,4) if bf else None,
   'avgExitVelocity':round(sum(ev)/len(ev),1) if ev else None,'hardHitRate':round(hard/len(ev),4) if ev else None,'whiffRate':round(whiffs/swings,4) if swings else None}
 except Exception as e:
  print('statcast',pid,e);return {}

def main():
 now=datetime.now(timezone.utc); start=(now-timedelta(days=1)).date().isoformat(); end=(now+timedelta(days=7)).date().isoformat()
 d=get(f'{BASE}/schedule?sportId=1&startDate={start}&endDate={end}&hydrate=probablePitcher(note),team')
 games=[]; ids=set()
 for day in d.get('dates',[]):
  for g in day.get('games',[]):
   teams=g.get('teams',{}); pp=g.get('probablePitchers',{})
   if not pp:
    pp={'away':(teams.get('away',{}) or {}).get('probablePitcher'),'home':(teams.get('home',{}) or {}).get('probablePitcher')}
   row={'gamePk':g.get('gamePk'),'gameDate':g.get('gameDate'),'status':(g.get('status') or {}).get('abstractGameState'),'venue':(g.get('venue') or {}).get('name'),
        'away':(teams.get('away',{}).get('team') or {}).get('name'),'home':(teams.get('home',{}).get('team') or {}).get('name'),
        'awayProbable':pp.get('away'),'homeProbable':pp.get('home')}
   for side in ('awayProbable','homeProbable'):
    if row[side] and row[side].get('id'):ids.add(row[side]['id'])
   games.append(row)
 pitchers={}
 for pid in ids:
  try:
   person=get(f'{BASE}/people/{pid}').get('people',[{}])[0]; st=season_stats(pid,'pitching')
   ip=float(st.get('inningsPitched') or 0); bf=float(st.get('battersFaced') or 0); so=float(st.get('strikeOuts') or 0); bb=float(st.get('baseOnBalls') or 0)
   pitchers[str(pid)]={'id':pid,'name':person.get('fullName'),'throws':(person.get('pitchHand') or {}).get('code'),'era':st.get('era'),
    'whip':st.get('whip'),'innings':ip,'strikeouts':so,'walks':bb,'battersFaced':bf,
    'kRate':round(so/bf,4) if bf else None,'bbRate':round(bb/bf,4) if bf else None,'kPer9':st.get('strikeoutsPer9Inn'),'bbPer9':st.get('walksPer9Inn'),'recent30':statcast_recent(pid)}
  except Exception as e: print('pitcher',pid,e)
 # Only store IDs for exact, unambiguous player-name matches in the markets.
 market_data=json.loads(Path('data/kalshi-mlb.json').read_text())
 names={m['label'].split(':',1)[0].strip() for m in market_data.get('markets',[])
        if m.get('kind') not in ('moneyline','spread','total') and ':' in m.get('label','')}
 players={}
 try:
  roster=get(f'{BASE}/sports/1/players?season={now.year}').get('people',[])
  by_name={}
  for person in roster:
   for field in ('fullName','nameFirstLast','firstLastName'):
    key=name_key(person.get(field))
    if key:by_name.setdefault(key,set()).add(person['id'])
  for name in names:
   matches=by_name.get(name_key(name),set())
   if len(matches)==1:players[name]=matches.pop()
 except Exception as e:print('player lookup',e)
 for pitcher in pitchers.values():
  if pitcher.get('name') in names:players[pitcher['name']]=pitcher['id']
 # One bulk request per 40 players gives each hitter prop a season sample.
 hitters={}
 hitter_ids=sorted({pid for name,pid in players.items() if name in names})
 for offset in range(0,len(hitter_ids),40):
  batch=hitter_ids[offset:offset+40]
  try:
   query=urllib.parse.urlencode({'personIds':','.join(map(str,batch)),
       'hydrate':f'stats(group=[hitting],type=[season],season={now.year})'})
   for person in get(f'{BASE}/people?{query}').get('people',[]):
    splits=[split for group in person.get('stats',[]) if (group.get('group') or {}).get('displayName')=='hitting'
            for split in group.get('splits',[]) if str((split.get('season') or now.year))==str(now.year)]
    if not splits:continue
    stat=splits[0].get('stat') or {};games=int(stat.get('gamesPlayed') or 0)
    if games<1:continue
    hitters[str(person['id'])]={'games':games,'hits':int(stat.get('hits') or 0),
      'homeRuns':int(stat.get('homeRuns') or 0),'rbi':int(stat.get('rbi') or 0),
      'totalBases':int(stat.get('totalBases') or 0)}
  except Exception as e:print('hitter season stats unavailable',e)
 Path('data').mkdir(exist_ok=True)
 Path('data/mlb-context.json').write_text(json.dumps({'updated_at':now.isoformat(),'source':'MLB Stats API','games':games,'pitchers':pitchers,'players':players,'hitters':hitters},indent=2))
 print('MLB context',len(games),'games',len(pitchers),'probable pitchers',len(players),'player photos of',len(names),'named props',len(hitters),'hitter samples')
if __name__=='__main__':main()
