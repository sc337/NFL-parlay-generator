import json, re, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
import csv, io

UA={'User-Agent':'Mozilla/5.0 sports-dashboard'}
BASE='https://statsapi.mlb.com/api/v1'

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
   teams=g.get('teams',{}); pp=g.get('probablePitchers',{});\n   if not pp:\n    pp={'away':(teams.get('away',{}) or {}).get('probablePitcher'),'home':(teams.get('home',{}) or {}).get('probablePitcher')}
   row={'gamePk':g.get('gamePk'),'gameDate':g.get('gameDate'),'venue':(g.get('venue') or {}).get('name'),
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
 Path('data').mkdir(exist_ok=True)
 Path('data/mlb-context.json').write_text(json.dumps({'updated_at':now.isoformat(),'source':'MLB Stats API','games':games,'pitchers':pitchers},indent=2))
 print('MLB context',len(games),'games',len(pitchers),'probable pitchers')
if __name__=='__main__':main()
