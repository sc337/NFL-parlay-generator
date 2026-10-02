"""Official NHL statistics only. No market prices enter this context."""
import json
import math
import unicodedata
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode
try:
    from scripts.update_kalshi_mlb import get
except ModuleNotFoundError:
    from update_kalshi_mlb import get

WEB = 'https://api-web.nhle.com/v1'
STATS = 'https://api.nhle.com/stats/rest/en'
TARGET = Path('data/nhl-context.json')
ALIASES = {'LAK': 'LA', 'SJS': 'SJ', 'TBL': 'TB', 'NJD': 'NJ', 'UTAH': 'UTA'}

def code(value):
    return ALIASES.get(value, value)

def name_key(value):
    text = unicodedata.normalize('NFKD', str(value or ''))
    return re.sub('[^a-z0-9]', '', text.encode('ascii', 'ignore').decode().lower())

def finite(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (ValueError, TypeError):
        return None

def team_stats(rows, metadata):
    out = {}
    for row in rows:
        abbr = metadata.get(row.get('teamId'))
        fields = {'games': 'gamesPlayed', 'goals_for': 'goalsForPerGame',
                  'goals_against': 'goalsAgainstPerGame', 'shots_for': 'shotsForPerGame',
                  'shots_against': 'shotsAgainstPerGame'}
        stats = {key: finite(row.get(source)) for key, source in fields.items()}
        if abbr and all(value is not None for value in stats.values()) and stats['games'] > 0:
            out[code(abbr)] = stats
    return out

def player_stats(rows):
    out = {}
    for row in rows:
        fields = {'games': 'gamesPlayed', 'goals': 'goals', 'assists': 'assists',
                  'points': 'points', 'shots': 'shots', 'toi': 'timeOnIcePerGame'}
        stats = {key: finite(row.get(source)) for key, source in fields.items()}
        if row.get('playerId') and all(value is not None for value in stats.values()) and stats['games'] > 0:
            out[str(row['playerId'])] = stats
    return out

def roster_rows(roster, abbr):
    rows = []
    for group in ('forwards', 'defensemen', 'goalies'):
        for player in roster.get(group, []):
            full = ' '.join(player.get(key, {}).get('default', '') for key in ('firstName', 'lastName')).strip()
            if player.get('id') and full:
                rows.append({'id': str(player['id']), 'name': full, 'key': name_key(full),
                             'team': code(abbr), 'position': player.get('positionCode'),
                             'headshot': player.get('headshot') or ''})
    return rows

def schedule_games(payload, now):
    out = {}
    for week in payload.get('gameWeek', []):
        for game in week.get('games', []):
            try:
                start = datetime.fromisoformat(game['startTimeUTC'].replace('Z', '+00:00'))
            except (KeyError, ValueError):
                continue
            if start <= now or game.get('gameState') not in ('FUT', 'PRE') or game.get('gameScheduleState') != 'OK':
                continue
            if game.get('awayTeam', {}).get('awaySplitSquad') or game.get('homeTeam', {}).get('homeSplitSquad'):
                continue
            out[str(game['id'])] = {'id': str(game['id']), 'start': start.isoformat(),
                'away': code(game['awayTeam']['abbrev']), 'home': code(game['homeTeam']['abbrev']),
                'season_type': game['gameType'], 'neutral': bool(game.get('neutralSite')),
                'starting_goalies': {}}
    return out

def collect(now, old=None):
    year = now.year if now.month >= 7 else now.year-1
    season, previous = year*10000+year+1, (year-1)*10000+year
    # Refresh schedules every run; bulk stats and rosters at most hourly.
    tasks = {f'schedule_{offset}': WEB+'/schedule/'+(now+timedelta(days=offset)).strftime('%Y-%m-%d') for offset in (0, 7)}
    reused = False
    if old and old.get('season') == season:
        try:
            reused = 0 <= (now-datetime.fromisoformat(old['stats_at'])).total_seconds() < 3600
        except (KeyError, ValueError):
            pass
    if not reused:
        tasks['metadata'] = STATS+'/team'
        for key, value in [('current', season), ('prior', previous)]:
            params = urlencode({'limit': -1, 'cayenneExp': f'seasonId={value} and gameTypeId=2'})
            tasks['team_'+key] = STATS+'/team/summary?'+params
            tasks['player_'+key] = STATS+'/skater/summary?'+params
    def fetch(item):
        key, url = item
        return key, get(url)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = dict(pool.map(fetch, tasks.items()))
    games = {}
    for key in ('schedule_0', 'schedule_7'):
        if not isinstance(results[key].get('gameWeek'), list):
            raise RuntimeError('Invalid official NHL schedule')
        games.update(schedule_games(results[key], now))
    clubs = {g[side] for g in games.values() for side in ('away', 'home')}
    if reused and clubs.issubset(set(old.get('roster_teams', []))):
        teams, players, rosters, league, stats_at = (old[k] for k in ('teams', 'players', 'rosters', 'league', 'stats_at'))
    else:
        if reused:
            # A newly scheduled club needs its roster, but existing stats remain usable.
            teams, players, league, stats_at = (old[k] for k in ('teams', 'players', 'league', 'stats_at'))
        else:
            for key in ('metadata', 'team_current', 'team_prior', 'player_current', 'player_prior'):
                if not isinstance(results[key].get('data'), list):
                    raise RuntimeError('Invalid NHL stats response: '+key)
            metadata = {row['id']: row.get('triCode') for row in results['metadata']['data']}
            current = team_stats(results['team_current']['data'], metadata)
            prior = team_stats(results['team_prior']['data'], metadata)
            teams = {abbr: {'current': current.get(abbr), 'prior': prior.get(abbr)} for abbr in set(current)|set(prior)}
            pc, pp = player_stats(results['player_current']['data']), player_stats(results['player_prior']['data'])
            players = {pid: {'current': pc.get(pid), 'prior': pp.get(pid)} for pid in set(pc)|set(pp)}
            total_games = sum(t['games'] for t in prior.values())
            if total_games < 100:
                raise RuntimeError('Insufficient prior NHL league sample')
            league = {field: sum(t[field]*t['games'] for t in prior.values())/total_games
                      for field in ('goals_for', 'shots_for')}
            stats_at = now.isoformat()
        urls = [(abbr, WEB+'/roster/'+{'LA': 'LAK', 'SJ': 'SJS', 'TB': 'TBL', 'NJ': 'NJD'}.get(abbr, abbr)+'/current') for abbr in sorted(clubs)]
        with ThreadPoolExecutor(max_workers=5) as pool:
            rosters = [player for abbr, roster in pool.map(fetch, urls) for player in roster_rows(roster, abbr)]
        if clubs and not clubs.issubset({row['team'] for row in rosters}):
            raise RuntimeError('Incomplete official NHL rosters')
    return {'updated_at': now.isoformat(), 'stats_at': stats_at, 'season': season,
            'prior_season': previous, 'source': 'Official NHL schedule, rosters and regular-season statistics',
            'league': league, 'games': games, 'teams': teams, 'players': players,
            'rosters': rosters, 'roster_teams': sorted(clubs), 'status': 'ready'}

def main():
    now = datetime.now(timezone.utc)
    try:
        old = json.loads(TARGET.read_text()) if TARGET.exists() else None
        payload = collect(now, old)
    except Exception as error:
        # Team quotes may still load. A failed context refresh never gets a new timestamp.
        print('NHL context unavailable; retaining its original timestamp:', str(error))
        if TARGET.exists():
            return
        payload = {'updated_at': None, 'status': 'unavailable', 'games': {}, 'teams': {}, 'players': {}, 'rosters': []}
    temporary = TARGET.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, indent=2)+'\n')
    temporary.replace(TARGET)
    print('NHL context:', len(payload['games']), 'games,', len(payload['players']), 'stat profiles')

if __name__ == '__main__':
    main()
