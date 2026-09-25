import json, re, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

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

def main():
 now=datetime.now(timezone.utc); start=(now-timedelta(days=1)).date().isoformat(); end=(now+timedelta(days=7)).date().isoformat()
 d=get(f'{BASE}/schedule?sportId=1&startDate={start}&endDate={end}&hydrate=probablePitcher,team')
 games=[]; ids=set()
 for day in d.get('dates',[]):
  for g in day.get('games',[]):
   teams=g.get('teams',{}); pp=g.get('probablePitchers',{})
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
    'kRate':round(so/bf,4) if bf else None,'bbRate':round(bb/bf,4) if bf else None,'kPer9':st.get('strikeoutsPer9Inn'),'bbPer9':st.get('walksPer9Inn')}
  except Exception as e: print('pitcher',pid,e)
 Path('data').mkdir(exist_ok=True)
 Path('data/mlb-context.json').write_text(json.dumps({'updated_at':now.isoformat(),'source':'MLB Stats API','games':games,'pitchers':pitchers},indent=2))
 print('MLB context',len(games),'games',len(pitchers),'probable pitchers')
if __name__=='__main__':main()
