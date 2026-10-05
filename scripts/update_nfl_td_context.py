"""Attach pregame touchdown opportunity from completed nflverse plays.

Only plays dated before the upcoming game are counted. A failed or stale
download leaves touchdown markets without an experimental forecast.
"""
import csv
import gzip
import io
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SNAPSHOT = Path('data/kalshi-nfl.json')
URL = 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz'
TEAM_CODES = {
    'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills',
    'CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns',
    'DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers',
    'HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs',
    'LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LA':'Los Angeles Rams','LAR':'Los Angeles Rams',
    'MIA':'Miami Dolphins','MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints',
    'NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers',
    'SEA':'Seattle Seahawks','SF':'San Francisco 49ers','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans',
    'WAS':'Washington Commanders','WSH':'Washington Commanders'
}

def truth(value): return str(value or '') in ('1', '1.0', 'True', 'TRUE')
def number(value):
    try: return float(value)
    except (ValueError, TypeError): return None
def norm(value): return re.sub(r'[^a-z0-9]', '', str(value or '').lower())

def alias(value):
    parts=re.findall(r'[a-z0-9]+',str(value or '').lower())
    return (parts[0][0]+parts[-1]) if len(parts)>1 else ''

def player_key(rows, name):
    exact=[key for key,player in rows.items() if norm(player['name'])==norm(name)]
    if len(exact)==1:return exact[0]
    short=[key for key,player in rows.items() if alias(player['name'])==alias(name)]
    return short[0] if len(short)==1 else None

def parse_plays(stream):
    games=defaultdict(lambda:{'players':defaultdict(lambda:{'rush':0,'target':0,'rz_rush':0,
        'rz_target':0,'ten_rush':0,'ten_target':0,'name':'','pass_attempts':0,'pass_completions':0,'pass_yards':0,'rush_yards':0,'receptions':0,'rec_yards':0,'pass_tds':0,'pass_interceptions':0}), 'tds':0,'date':''})
    for p in csv.DictReader(stream):
        if p.get('season_type') not in (None,'REG') or truth(p.get('no_play')) or truth(p.get('two_point_attempt')):continue
        date=str(p.get('game_date') or '')[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):continue
        code=str(p.get('posteam') or '').upper();team=TEAM_CODES.get(code)
        game_id=p.get('game_id')
        if not team or not game_id:continue
        game=games[(team,game_id)];game['date']=date
        yardline=number(p.get('yardline_100'))
        if truth(p.get('rush_touchdown')) or truth(p.get('pass_touchdown')):game['tds']+=1
        for kind,who,name in (('rush',p.get('rusher_player_id'),p.get('rusher_player_name')),
                              ('target',p.get('receiver_player_id'),p.get('receiver_player_name'))):
            if not who or not name or not truth(p.get('rush_attempt' if kind=='rush' else 'pass_attempt')):continue
            stats=game['players'][who];stats['name']=name;stats[kind]+=1
            if yardline is not None and yardline<=20:stats['rz_'+kind]+=1
            if yardline is not None and yardline<=10:stats['ten_'+kind]+=1
        # Count official stat outcomes separately from touchdown opportunity.
        passer=p.get('passer_player_id');name=p.get('passer_player_name')
        if passer and name and truth(p.get('pass_attempt')) and not truth(p.get('sack')):
            stats=game['players'][passer];stats['name']=name;stats['pass_attempts']+=1
            if truth(p.get('complete_pass')):
                stats['pass_completions']+=1
                stats['pass_yards']+=number(p.get('passing_yards')) or number(p.get('yards_gained')) or 0
            stats['pass_tds']+=int(truth(p.get('pass_touchdown')))
            stats['pass_interceptions']+=int(truth(p.get('interception')))
        rusher=p.get('rusher_player_id')
        if rusher and truth(p.get('rush_attempt')):
            game['players'][rusher]['rush_yards']+=number(p.get('rushing_yards')) or number(p.get('yards_gained')) or 0
        receiver=p.get('receiver_player_id')
        if receiver and truth(p.get('complete_pass')):
            stats=game['players'][receiver];stats['receptions']+=1
            stats['rec_yards']+=number(p.get('receiving_yards')) or number(p.get('yards_gained')) or 0
    return games

def weight(s):
    return (s['rush']*.08+s['target']*.16+s['rz_rush']*1.2+s['rz_target']*1.1+
            s['ten_rush']*2.0+s['ten_target']*1.7)

def attach(snapshot,games,now=None):
    now=now or datetime.now(timezone.utc)
    attached=0
    props_attached=0
    for game in snapshot.get('games') or []:
        for market in game.get('markets') or []:market.pop('propHistory',None)
    for game in snapshot.get('games') or []:
        kickoff=game.get('commence_time')
        try: day=datetime.fromisoformat(kickoff.replace('Z','+00:00')).date().isoformat()
        except (AttributeError,ValueError):continue
        # The scoreboard may still contain a same-day game that has begun.
        if datetime.fromisoformat(kickoff.replace('Z','+00:00'))<=now:continue
        for team in (game.get('home'),game.get('away')):
            prior=sorted(((gid,row) for (name,gid),row in games.items()
                          if name==team and row['date']<day and row['date']<now.date().isoformat()),
                         key=lambda item:item[1]['date'])[-5:]
            if len(prior)<2:continue
            players={}
            for _,row in prior:
                for key,stats in row['players'].items():
                    entry=players.setdefault(key,{'name':stats['name'],**{k:0 for k in ('rush','target','rz_rush','rz_target','ten_rush','ten_target')}})
                    for k in ('rush','target','rz_rush','rz_target','ten_rush','ten_target'):entry[k]+=stats[k]
            # Include zero-usage games in samples, and require activity in the
            # latest completed team game. Never infer role from quote counts.
            for market in game.get('markets') or []:
                if not market.get('player') or market.get('team')!=team or not market.get('_rosterVerified'):continue
                key=player_key(players,market.get('player'))
                if key is None or len(prior)<3:continue
                history=[row['players'].get(key,{}) for _,row in prior]
                active=lambda s:sum(s.get(k,0) for k in ('rush','target','pass_attempts'))>0
                played=sum(active(s) for s in history)
                if played<3 or not active(history[-1]):continue
                metrics={}
                mapping={'player_pass_yds':'pass_yards','player_rush_yds':'rush_yards',
                    'player_reception_yds':'rec_yards','player_receptions':'receptions',
                    'player_rush_attempts':'rush','player_pass_attempts':'pass_attempts',
                    'player_pass_completions':'pass_completions','player_pass_tds':'pass_tds',
                    'player_pass_interceptions':'pass_interceptions'}
                for kind,stat in mapping.items():
                    values=[float(s.get(stat,0)) for s in history]
                    if any(v!=0 for v in values):metrics[kind]=values
                if not metrics:continue
                market['propHistory']={'games':len(prior),'played':played,'latest_game':prior[-1][1]['date'],
                    'dates':[row['date'] for _,row in prior],'metrics':metrics,'source':'nflverse completed plays'}
                props_attached+=1
            total=sum(weight(s) for s in players.values())
            if total<5:continue
            tds=sum(row['tds'] for _,row in prior)
            for market in game.get('markets') or []:
                if market.get('type')!='td' or market.get('team')!=team or not market.get('_rosterVerified'):continue
                key=player_key(players,market.get('player'))
                if key is None:continue
                s=players[key];share=weight(s)/total
                if s['rush']+s['target']<2 or share<=0:continue
                market['tdOpportunity']={'games':len(prior),'share':round(share,4),
                    'team_tds_per_game':round(tds/len(prior),3),'latest_game':prior[-1][1]['date'],
                    'rush':s['rush'],'target':s['target'],'rz_rush':s['rz_rush'],'rz_target':s['rz_target'],
                    'ten_rush':s['ten_rush'],'ten_target':s['ten_target'],'source':'nflverse completed plays'}
                attached+=1
    snapshot['prop_context']={'source':'nflverse completed plays','updated_at':now.isoformat(),'attached':props_attached}
    snapshot['td_context']={'source':'nflverse play by play','updated_at':now.isoformat(),'attached':attached}
    return attached

def main():
    data=json.loads(SNAPSHOT.read_text());now=datetime.now(timezone.utc)
    seasons={datetime.fromisoformat(g['commence_time'].replace('Z','+00:00')).year for g in data.get('games',[]) if g.get('commence_time')}
    if not seasons:return
    try:
        all_games={}
        for season in seasons:
            req=Request(URL.format(season=season),headers={'User-Agent':'NFL-parlay-generator/td-context','Accept':'application/gzip'})
            with urlopen(req,timeout=25) as response:
                compressed=response.read(12_000_001)
            if len(compressed)>12_000_000:raise ValueError('Play by play archive too large')
            with gzip.open(io.BytesIO(compressed),mode='rt',encoding='utf-8') as stream:
                all_games.update(parse_plays(stream))
        print('Touchdown opportunity attached:',attach(data,all_games,now))
    except Exception as error:
        print('WARN touchdown opportunity unavailable:',error)
        for game in data.get('games') or []:
            for market in game.get('markets') or []:market.pop('propHistory',None)
        data['prop_context']={'updated_at':now.isoformat(),'attached':0,'status':'unavailable'}
        data['td_context']={'source':'nflverse play by play','updated_at':now.isoformat(),'attached':0,'status':'unavailable'}
    SNAPSHOT.write_text(json.dumps(data,separators=(',',':')))

if __name__=='__main__':main()
