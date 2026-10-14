"""Schedule/roster-verified NBA quotes and completed-game basketball context.

No preseason box score enters the model. Missing stats remain missing; failed
refreshes do not rewrite old quote timestamps. Public read-only endpoints only.
"""
import json
import math
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
try:
    from scripts.update_kalshi_mlb import get, price
except ModuleNotFoundError:
    from update_kalshi_mlb import get, price

API = 'https://external-api.kalshi.com/trade-api/v2'
ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
SERIES = {'KXNBAGAME': 'moneyline', 'KXNBASPREAD': 'spread', 'KXNBATOTAL': 'total',
          'KXNBAPTS': 'points', 'KXNBAREB': 'rebounds', 'KXNBAAST': 'assists',
          'KXNBA3PT': 'threes', 'KXNBAPRA': 'pra', 'KXNBAPR': 'pr', 'KXNBAPA': 'pa',
          'KXNBARA': 'ra', 'KXNBASTL': 'steals', 'KXNBABLK': 'blocks'}
ALIASES = {'GS': 'GSW', 'NY': 'NYK', 'NO': 'NOP', 'SA': 'SAS', 'UTAH': 'UTA',
           'PHO': 'PHX', 'BKN': 'BKN', 'BRK': 'BKN', 'BK': 'BKN', 'CHO': 'CHA', 'WSH': 'WAS'}
CODESET = set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split()) | set(ALIASES)
LABELS = {'points': 'Points', 'rebounds': 'Rebounds', 'assists': 'Assists', 'threes': 'Threes',
          'pra': 'PRA', 'pr': 'Pts + Reb', 'pa': 'Pts + Ast', 'ra': 'Reb + Ast', 'steals': 'Steals', 'blocks': 'Blocks'}

def key(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)).casefold() if c.isalnum() and not unicodedata.combining(c))

def code(s):
    return ALIASES.get(str(s).upper(), str(s).upper())

def instant(s):
    try:
        return datetime.fromisoformat(str(s).replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None

def event_match(m, events):
    parts = re.search(r'-(\d{2}[A-Z]{3}\d{2})(\d{4})?([A-Z]+)$', m.get('event_ticker', ''))
    if not parts:
        return None
    try:
        day = datetime.strptime(parts[1], '%y%b%d').date()
    except ValueError:
        return None
    pair = {(code(a), code(parts[3][len(a):])) for a in CODESET if parts[3].startswith(a) and parts[3][len(a):] in CODESET}
    if len(pair) != 1:
        return None
    matched = []
    for e in events:
        start = instant(e.get('date'))
        comp = (e.get('competitions') or [{}])[0]
        sides = {c.get('homeAway'): c.get('team', {}) for c in comp.get('competitors', [])}
        if not start or not all(s in sides for s in ('away', 'home')):
            continue
        local = start.astimezone(ZoneInfo('America/New_York'))
        if local.date() == day and (code(sides['away'].get('abbreviation')), code(sides['home'].get('abbreviation'))) in pair and (not parts[2] or local.strftime('%H%M') == parts[2]):
            matched.append((e, comp, sides))
    return matched[0] if len(matched) == 1 else None

def threshold(m):
    text = ' '.join(str(m.get(k) or '') for k in ('yes_sub_title', 'subtitle', 'title'))
    match = re.search(r'\b(\d+(?:\.\d+)?)\+\b|\b(?:over|more than|at least)\s+(\d+(?:\.\d+)?)', text, re.I)
    # A '+' milestone includes the boundary; 'over' does not.
    plus = re.search(r'(\d+(?:\.\d+)?)\+', text)
    if plus:
        v = float(plus[1]); return v - .5 if v.is_integer() and v > 0 else None
    if match:
        v = float(match[2] or match[1]); inclusive = bool(re.search(r'at least', text, re.I))
        return v if v % 1 == .5 else v + (-.5 if inclusive else .5) if v.is_integer() else None
    try:
        v = float(m['floor_strike'])
    except (ValueError, TypeError, KeyError):
        return None
    if not math.isfinite(v) or v < 0:
        return None
    if m.get('strike_type') == 'greater':
        return v if v % 1 == .5 else v + .5 if v.is_integer() else None
    if m.get('strike_type') == 'greater_or_equal' and v.is_integer() and v > 0:
        return v - .5
    return None

def normalize_market(m, series, events, ctx, now):
    matched = event_match(m, events)
    if not matched or m.get('status') not in ('active', 'open'):
        return []
    e, comp, sides = matched
    state = (e.get('status') or comp.get('status') or {}).get('type', {}).get('state')
    if state != 'pre' or instant(e['date']) <= now:
        return []
    teams = [{'code': code(sides[s].get('abbreviation')), 'id': str(sides[s].get('id')),
              'name': sides[s].get('displayName'), 'short': sides[s].get('shortDisplayName'),
              'logo': sides[s].get('logo', '')} for s in ('away', 'home')]
    kind = SERIES[series]; line = threshold(m) if kind != 'moneyline' else None
    if kind != 'moneyline' and line is None:
        return []
    tail = str(m.get('ticker') or '').rsplit('-', 1)[-1]
    selected = next((t for t in teams if any(re.fullmatch(re.escape(c)+r'\d*(?:\.\d+)?', tail) for c in CODESET if code(c) == t['code'])), None)
    player = None
    if kind in LABELS:
        text = key(' '.join(str(m.get(k) or '') for k in ('title', 'yes_sub_title', 'subtitle')))
        players = [p for p in ctx.get('players', {}).values() if p['team'] in [t['code'] for t in teams] and len(key(p['name'])) >= 6 and key(p['name']) in text]
        if len(players) != 1:
            return []
        player = players[0]; selected = next(t for t in teams if t['code'] == player['team'])
    if kind != 'total' and not selected:
        return []
    rows = []
    for side in (['yes'] if kind == 'moneyline' else ['yes', 'no']):
        ask, bid = price(m, side, 'ask'), price(m, side, 'bid')
        if ask is None or bid is None or not 0 < bid <= ask < 1:
            continue
        team = next(t for t in teams if t != selected) if kind == 'spread' and side == 'no' else selected
        label = team['short']+' ML' if kind == 'moneyline' else team['short']+' '+('-' if side == 'yes' else '+')+str(line)+' Spread' if kind == 'spread' else (player['name']+' ' if player else '')+('Over' if side == 'yes' else 'Under')+' '+str(line)+' '+LABELS.get(kind, 'points')
        rows.append({'ticker': m['ticker'], 'event_ticker': m['event_ticker'], 'series': series,
                     'selection_id': m['ticker']+'|'+side, 'kind': kind, 'side': side, 'quoteSide': side,
                     'label': label, 'title': label, 'contract_title': m.get('title'), 'line': line,
                     'team_code': team['code'] if team else None, 'teams': teams,
                     'player': player['name'] if player else None, 'player_id': player['id'] if player else None,
                     'player_verified': bool(player), 'headshot': player.get('headshot') if player else None,
                     'injury_status': player.get('injury_status', '') if player else '',
                     'probability': (ask+bid)/2, 'yes_ask': ask, 'yes_bid': bid, 'spread': ask-bid,
                     'volume': float(m.get('volume_fp') or m.get('volume') or 0), 'source': 'Kalshi',
                     'game_id': str(e['id']), 'game_time': e['date'], 'game_status': state,
                     'game_label': teams[0]['short']+' vs '+teams[1]['short'],
                     'season_type': e.get('season', {}).get('type'), 'close_time': m.get('close_time')})
    return rows

def values(stats):
    return {x.get('name'): x.get('displayValue') for x in stats}

def event_type(e):
    return (e.get('seasonType') or {}).get('type') or (e.get('season') or {}).get('type')

def event_status(e):
    return e.get('status') or (e.get('competitions') or [{}])[0].get('status') or {}

def box_record(e, summary, now):
    if not instant(e.get('date')) or instant(e['date']) >= now or not event_status(e).get('type', {}).get('completed') or event_type(e) not in (2, 3):
        return [], []
    sides = e['competitions'][0]['competitors']
    scores = {str(c['team']['id']): float(c['score'].get('value', c['score'].get('displayValue')) if isinstance(c['score'], dict) else c['score']) for c in sides}
    team_rows, player_rows = [], []
    box = summary.get('boxscore', {}); possessions = {}
    for t in box.get('teams', []):
        v = values(t.get('statistics', []))
        try:
            fga = float(v['fieldGoalsMade-fieldGoalsAttempted'].split('-')[1]); fta = float(v['freeThrowsMade-freeThrowsAttempted'].split('-')[1])
            possessions[str(t['team']['id'])] = fga + .44*fta - float(v['offensiveRebounds']) + float(v['turnovers'])
        except (KeyError, ValueError, TypeError, IndexError):
            pass
    if len(possessions) != 2:
        return [], []
    pace = sum(possessions.values())/2
    if not 70 <= pace <= 140:
        return [], []
    for c in sides:
        tid = str(c['team']['id']); other = next(k for k in scores if k != tid)
        team_rows.append((code(c['team']['abbreviation']), {'date': e['date'], 'season_type': event_type(e), 'points': scores[tid], 'allowed': scores[other], 'possessions': pace}))
    for t in box.get('players', []):
        for group in t.get('statistics', []):
            labels = group.get('labels', [])
            for a in group.get('athletes', []):
                if a.get('didNotPlay'):
                    continue
                v = dict(zip(labels, a.get('stats', [])))
                try:
                    minutes = str(v['MIN']).split(':'); mins = float(minutes[0])+(float(minutes[1])/60 if len(minutes) > 1 else 0)
                    row = {'date': e['date'], 'season_type': event_type(e), 'team': code(t['team']['abbreviation']), 'minutes': mins}
                    for k, label in {'points': 'PTS', 'rebounds': 'REB', 'assists': 'AST', 'steals': 'STL', 'blocks': 'BLK'}.items():
                        row[k] = float(v[label])
                    row['threes'] = float(v['3PT'].split('-')[0]); player_rows.append((str(a['athlete']['id']), row))
                except (KeyError, ValueError, TypeError, IndexError):
                    pass
    return team_rows, player_rows

def context(events, now):
    target = Path('data/nba-context.json')
    old = json.loads(target.read_text()) if target.exists() else {}
    at = instant(old.get('updated_at'))
    games = {}; teams = {}
    for e in events:
        if not instant(e.get('date')) or instant(e['date']) <= now:
            continue
        comp = e['competitions'][0]; sides = {c['homeAway']: c['team'] for c in comp['competitors']}
        games[str(e['id'])] = {'start': e['date'], 'away': code(sides['away']['abbreviation']), 'home': code(sides['home']['abbreviation']), 'neutral': comp.get('neutralSite', False), 'season_type': e.get('season', {}).get('type')}
        teams.update({str(t['id']): t for t in sides.values()})
    if old.get('schemaVersion') == 1 and at and timedelta(0) <= now-at < timedelta(hours=2) and set(games).issubset(old.get('games', {})):
        return old
    players = {}; histories = {}; seen = {}
    def team_data(item):
        tid, t = item; roster = get(ESPN+'/teams/'+tid+'/roster'); season = now.year+1 if now.month >= 9 else now.year
        schedule = get(ESPN+'/teams/'+tid+'/schedule?season='+str(season))
        recent = [e for e in schedule.get('events', []) if instant(e.get('date')) and instant(e['date']) < now and event_status(e).get('type', {}).get('completed') and event_type(e) in (2, 3)]
        if len(recent) < 8:
            prior = get(ESPN+'/teams/'+tid+'/schedule?season='+str(season-1)); recent += [e for e in prior.get('events', []) if instant(e.get('date')) and now-timedelta(days=240) < instant(e['date']) < now and event_status(e).get('type', {}).get('completed') and event_type(e) in (2, 3)]
        return t, roster, sorted(recent, key=lambda e:e['date'])[-12:]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for t, roster, recent in pool.map(team_data, teams.items()):
            histories[code(t['abbreviation'])] = {'games': []}
            for p in roster.get('athletes', []):
                pid = str(p['id']); injuries = p.get('injuries') or []
                players[pid] = {'id': pid, 'name': p['displayName'], 'team': code(t['abbreviation']), 'headshot': p.get('headshot', {}).get('href', ''), 'injury_status': injuries[0].get('status', '') if injuries else '', 'games': []}
            seen.update({str(e['id']): e for e in recent})
        def summary(e):
            return e, get(ESPN+'/summary?event='+str(e['id']))
        for e, box in pool.map(summary, seen.values()):
            tr, pr = box_record(e, box, now)
            for code_, row in tr:
                if code_ in histories: histories[code_]['games'].append(row)
            for pid, row in pr:
                if pid in players and players[pid]['team'] == row['team']: players[pid]['games'].append(row)
    for t in histories.values(): t['games'].sort(key=lambda r:r['date'])
    for p in players.values(): p['games'].sort(key=lambda r:r['date'])
    return {'schemaVersion': 1, 'updated_at': now.isoformat(), 'games': games, 'teams': histories, 'players': players, 'sources': ['ESPN completed NBA box scores and current rosters'], 'availability': 'Roster injury status; starting lineups not confirmed'}

def main():
    now = datetime.now(timezone.utc); days = [(now+timedelta(days=i)).strftime('%Y%m%d') for i in range(8)]
    events = []
    for day in days: events.extend(get(ESPN+'/scoreboard?dates='+day+'&limit=100').get('events', []))
    events = list({str(e['id']): e for e in events}.values()); ctx = context(events, now); rows = []
    for series in SERIES:
        cursor = None
        for _ in range(20):
            params = {'series_ticker': series, 'status': 'open', 'limit': 1000, 'mve_filter': 'exclude'}
            if cursor: params['cursor'] = cursor
            payload = get(API+'/markets?'+urlencode(params))
            for m in payload.get('markets', []): rows.extend(normalize_market(m, series, events, ctx, now))
            next_cursor = payload.get('cursor')
            if not next_cursor or next_cursor == cursor: break
            cursor = next_cursor
        else: raise RuntimeError('NBA market pagination limit exceeded')
    Path('data/nba-context.json').write_text(json.dumps(ctx)+'\n')
    Path('data/kalshi-nba.json').write_text(json.dumps({'updated_at': now.isoformat(), 'source': 'Kalshi', 'markets': rows, 'series': SERIES})+'\n')
    print('NBA', len(rows), 'schedule-verified quotes')

if __name__ == '__main__':
    main()
