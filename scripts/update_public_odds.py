"""Fill verified schedule/selection gaps with attributed ESPN sportsbook references.

Current native quotes win. Missing prices, props and fighter odds stay missing.
Exchange quotes keep their original timestamps even when this source refreshes.
"""
import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
try:
    from .update_ncaaf_slate import normalize, instant, number
except ImportError:
    from update_ncaaf_slate import normalize, instant, number

PATHS = {'mlb': 'baseball/mlb', 'nba': 'basketball/nba', 'ncaaf': 'football/college-football',
         'nfl': 'football/nfl', 'nhl': 'hockey/nhl', 'ufc': 'mma/ufc'}
CODES = {'nba': {'GS': 'GSW', 'NY': 'NYK', 'NO': 'NOP', 'SA': 'SAS', 'WSH': 'WAS', 'UTAH': 'UTA'},
         'nhl': {'NJD': 'NJ', 'LAK': 'LA', 'SJS': 'SJ', 'TBL': 'TB', 'WAS': 'WSH'}}


def norm(value):
    return re.sub('[^a-z0-9]', '', str(value).lower())


def code(sport, team, ctx):
    raw = str(team.get('abbreviation') or '').upper()
    if raw in ctx.get('teams', {}):
        return raw
    return CODES.get(sport, {}).get(raw, raw)


def same_time(a, b):
    x, y = instant(a), instant(b)
    return bool(x and y and abs((x-y).total_seconds()) <= 300)


def resolve(sport, game, snapshot, ctx):
    """Map source IDs only with exact participants AND kickoff (doubleheader-safe)."""
    gid, start = game['game_id'], game['game_time']
    home, away = game['home'], game['away']
    codes = {s: code(sport, game[s], ctx) for s in ('home', 'away')}
    metadata = {'game_id': gid, 'teams': [{'id': str(game[s]['id']), 'code': codes[s],
                 'name': game[s]['displayName'], 'short': game[s].get('shortDisplayName', game[s]['displayName']),
                 'logo': game[s].get('logo')} for s in ('away', 'home')]}
    if sport == 'nfl':
        matches = [g for g in snapshot.get('games', []) if norm(g.get('home')) == norm(home['displayName'])
                   and norm(g.get('away')) == norm(away['displayName']) and same_time(g.get('commence_time'), start)]
        if len(matches) == 1:
            metadata['game_id'] = str(matches[0]['id'])
        elif len(matches) > 1:
            return None
    elif sport == 'mlb':
        matches = [g for g in ctx.get('games', []) if norm(g.get('home')) == norm(home['displayName'])
                   and norm(g.get('away')) == norm(away['displayName']) and same_time(g.get('gameDate'), start)]
        if len(matches) == 1:
            metadata['game_id'] = str(matches[0]['gamePk'])
        else:
            # ESPN IDs must never impersonate MLB official gamePk identifiers.
            metadata['context_unmatched'] = True
    elif sport == 'nhl':
        matches = [(key, g) for key, g in ctx.get('games', {}).items()
                   if g.get('home') == codes['home'] and g.get('away') == codes['away'] and same_time(g.get('start'), start)]
        if len(matches) == 1:
            metadata['context_game_id'] = str(matches[0][0])
        else:
            metadata['context_unmatched'] = True
    elif sport == 'nba':
        g = ctx.get('games', {}).get(gid)
        if g and same_time(g.get('start'), start) and g.get('home') == codes['home'] and g.get('away') == codes['away'] and (game.get('season_type') is None or game['season_type'] == g.get('season_type')):
            metadata['season_type'] = g.get('season_type')
        else:
            metadata['context_unmatched'] = True
    return metadata


def participants(game):
    return {s: game[s]['displayName'] for s in ('home', 'away')}


def adapt(sport, row, game, metadata):
    m = {**row, **metadata, 'espn_game_id': game['game_id'], 'series': 'ESPN_REFERENCE', 'isAltLine': False}
    names = participants(game)
    team_side = row.get('side') if row.get('side') in names else None
    if sport == 'nhl':
        m['title'] = m['label'] = row['title'].replace('points scored', 'goals')
    m['team_code'] = next((t['code'] for t in metadata['teams'] if t['id'] == row.get('team_id')), None)
    if sport in ('nba', 'nhl'):
        m['line'] = abs(row['point']) if row['point'] is not None else None
        m['side'] = 'no' if row['side'] == 'under' or row['kind'] == 'spread' and row['point'] > 0 else 'yes'
        m['season_type'] = metadata.get('season_type', game.get('season_type'))
    if sport == 'mlb':
        m['title'] = m['label'] = row['title'].replace('points scored', 'runs scored')
    if sport == 'nfl':
        kind = {'moneyline': 'h2h', 'spread': 'spreads', 'total': 'totals'}[row['kind']]
        m.update(type=kind, marketKey=kind, name=row['label'] + (' ML' if kind == 'h2h' else ''),
                 gameId=metadata['game_id'], kickoff=game['game_time'],
                 marketProbability=row['probability'], prob=row['probability'], quoteProbability=row['probability'],
                 team=names[team_side] if team_side else 'Game')
    return m


def selected_team(m, game, ctx):
    for t in m.get('teams', []):
        if t.get('code') == m.get('team_code'):
            return norm(t.get('name'))
    if m.get('team') and m['team'] not in ('Game', 'Player'):
        return norm(m['team'])
    title = norm(m.get('contract_title') or m.get('title') or m.get('label'))
    aliases = {}
    c = ctx.get('games', {})
    college = c.get(str(m.get('game_id')), {}) if isinstance(c, dict) else {}
    for side in ('home', 'away'):
        t = game[side]
        names = [t.get(k) for k in ('displayName', 'location', 'shortDisplayName')]
        names += college.get(side, {}).get('aliases', []) if isinstance(college.get(side), dict) else []
        for name in names:
            if name and (title == norm(name) or title.startswith(norm(name) + 'wins') or title.startswith(norm(name) + 'ml')):
                aliases[side] = norm(t['displayName'])
    return next(iter(aliases.values())) if len(aliases) == 1 else None


def slot(sport, m, game, ctx):
    kind = {'h2h': 'moneyline', 'spreads': 'spread', 'totals': 'total'}.get(m.get('type'), m.get('kind'))
    if kind not in ('moneyline', 'spread', 'total') or m.get('player'):
        return None
    # Team totals must not suppress a game total at the same number.
    if m.get('series') == 'KXMLBTEAMTOTAL' or re.search(r'\bscore (?:over|under)\b', str(m.get('title', '')), re.I):
        return None
    direction = None
    point = number(m.get('point'))
    if kind == 'total':
        text = str(m.get('title') or m.get('label') or m.get('name', ''))
        direction = 'under' if m.get('side') in ('no', 'under') or re.match('Under ', text, re.I) else 'over'
        if point is None:
            point = number(m.get('line'))
        if point is None:
            hit = re.search(r'(?:over|under)\s+(\d+(?:\.\d+)?)', text, re.I)
            point = number(hit[1]) if hit else None
        if point is None:
            return None
    else:
        direction = selected_team(m, game, ctx)
        if not direction:
            return None
        if kind == 'spread' and point is None:
            line = number(m.get('line'))
            if line is not None:
                point = abs(line) * (1 if m.get('side') == 'no' else -1)
            else:
                hit = re.search(r'wins by (over|under)\s+(\d+(?:\.\d+)?)', str(m.get('title') or m.get('label')), re.I)
                point = number(hit[2]) * (-1 if hit[1].lower() == 'over' else 1) if hit else None
        if kind == 'spread' and point is None:
            return None
    return kind, direction, point


def healthy(sport, m, at, now):
    if m.get('game_status') in ('in', 'post', 'Live', 'Final'):
        return False
    quoted = instant(m.get('quotedAt') or at)
    ask = number(m.get('yes_ask') if sport != 'nfl' else m.get('quoteProbability'))
    if ask is None and sport == 'nfl':
        price = number(m.get('price'))
        ask = (100/(100+price) if price > 0 else abs(price)/(100+abs(price))) if price and abs(price) >= 100 else None
    if not quoted or not -300 <= (now-quoted).total_seconds() <= 1800 or not ask or not 0 < ask < 1:
        return False
    if m.get('referenceOnly'):
        return False
    if sport == 'nfl':
        return (number(m.get('sourceQuality')) or 0) >= 60
    spread = number(m.get('spread'))
    volume = number(m.get('volume'))
    return spread is not None and 0 <= spread <= .08 and volume is not None and volume >= (50 if sport == 'nba' else 150 if sport == 'ncaaf' else 100)


def combat(events, now):
    games = []
    for event in events:
        for c in event.get('competitions', []):
            at = instant(c.get('date') or event.get('date'))
            state = (c.get('status', {}).get('type') or {}).get('state')
            fighters = [x.get('athlete', {}).get('displayName') for x in c.get('competitors', [])]
            if state != 'pre' or not at or at <= now or len(fighters) != 2 or not all(fighters):
                continue
            games.append({'game_id': str(c['id']), 'game_time': at.isoformat(), 'game_status': 'pre',
                          'game_label': ' vs '.join(fighters), 'fighter1': fighters[0], 'fighter2': fighters[1],
                          'card_name': event.get('name'), 'source': 'ESPN', 'checked_at': now.isoformat()})
    return games, []  # The public UFC scoreboard does not currently supply odds.


def enrich(sport, snapshot, events, ctx, now):
    original_at = snapshot.get('updated_at') or snapshot.get('generated_at')
    snapshot = json.loads(json.dumps(snapshot))
    if sport == 'ufc':
        games, refs = combat(events, now)
    else:
        # Flatten competitions, preserving the ESPN season type for preseason guards.
        flattened = [{**e, 'id': str(c.get('id') or e.get('id')), 'date': c.get('date') or e.get('date'), 'competitions': [c]}
                     for e in events for c in e.get('competitions', [])]
        games, refs = normalize(flattened, now)
        seasons = {str(e['id']): (e.get('season') or {}).get('type') for e in flattened}
        for g in games:
            g['season_type'] = seasons.get(g['game_id'])
    native = snapshot.get('games', []) if sport == 'nfl' else snapshot.get('markets', [])
    if sport == 'nfl':
        for g in native:
            g['markets'] = [m for m in g.get('markets', []) if not m.get('referenceOnly')]
            for m in g['markets']:
                m.setdefault('quotedAt', original_at)
    else:
        native = snapshot['markets'] = [m for m in native if not m.get('referenceOnly')]
        for m in native:
            m.setdefault('quotedAt', original_at)
    output_games, added = [], 0
    by_id = {g['game_id']: g for g in games}
    groups = {}
    for m in refs:
        groups.setdefault(str(m['game_id']), []).append(m)
    for gid, game in by_id.items():
        metadata = resolve(sport, game, snapshot, ctx) if sport != 'ufc' else {'game_id': gid}
        if not metadata:
            continue
        mapped = {**game, 'espn_game_id': gid, 'game_id': metadata['game_id']}
        # Store only identities needed for display, not ESPN's verbose team links.
        for side in ('home', 'away'):
            if side in mapped:
                mapped[side] = {k: mapped[side].get(k) for k in ('id', 'displayName', 'abbreviation')}
        output_games.append(mapped)
        if sport == 'ufc':
            continue
        if sport == 'nfl':
            found = [g for g in native if str(g['id']) == metadata['game_id']]
            if found:
                target = found[0]['markets']
            else:
                new_game = {'id': metadata['game_id'], **participants(game), 'commence_time': game['game_time'],
                            'game_status': 'pre', 'dataSource': 'Public reference', 'markets': []}
                native.append(new_game); target = new_game['markets']
        else:
            target = native
        existing = [m for m in target if str(m.get('game_id') or m.get('gameId') or metadata['game_id']) == metadata['game_id']]
        occupied = {slot(sport, m, game, ctx) for m in existing if healthy(sport, m, original_at, now)}
        for row in groups.get(gid, []):
            m = adapt(sport, row, game, metadata)
            key = slot(sport, m, game, ctx)
            if key is None or key in occupied:
                continue
            target.append(m); occupied.add(key); added += 1
    if sport == 'nfl':
        snapshot['games'] = native
    snapshot['primary_updated_at'] = snapshot.get('primary_updated_at') or original_at
    snapshot['updated_at'] = now.isoformat()
    snapshot['slate'] = {'source': 'ESPN', 'updated_at': now.isoformat(), 'games': output_games,
                         'reference_markets': added, 'providers': sorted({m['source'] for m in refs})}
    snapshot['coverage'] = {'policy': 'Fresh native quotes first; public references fill exact selection gaps',
                            'reference_markets': added, 'schedule_events': len(output_games),
                            'unavailable': ['Player props and specialty markets are not supplied by this public scoreboard']}
    return snapshot


def collect(sport, now, fetch=None):
    def get(day):
        url = 'https://site.api.espn.com/apis/site/v2/sports/' + PATHS[sport] + '/scoreboard?dates=' + day + '&limit=500'
        if sport == 'ncaaf':
            url += '&groups=80'
        if fetch:
            payload = fetch(url)
        else:
            with urlopen(Request(url, headers={'User-Agent': 'sports-dashboard/1.0', 'Accept': 'application/json'}), timeout=20) as r:
                payload = json.load(r)
        if not isinstance(payload, dict) or not isinstance(payload.get('events'), list):
            raise ValueError('Invalid ESPN scoreboard schema')
        return payload['events']
    dates = [(now.astimezone(ZoneInfo('America/Los_Angeles')) + timedelta(days=i)).strftime('%Y%m%d') for i in range(8)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        events = [e for day in pool.map(get, dates) for e in day]
    return list({str(e['id']): e for e in events if e.get('id')}.values())


def main(sport):
    path = Path('data/kalshi-' + sport + '.json')
    now = datetime.now(timezone.utc)
    try:
        events = collect(sport, now)
        snapshot = json.loads(path.read_text()) if path.exists() else {'games' if sport == 'nfl' else 'markets': []}
        context_path = Path('data/' + sport + '-context.json')
        ctx = json.loads(context_path.read_text()) if context_path.exists() else {}
        result = enrich(sport, snapshot, events, ctx, now)
        temp = path.with_suffix('.json.tmp'); temp.write_text(json.dumps(result, separators=(',', ':')) + '\n'); temp.replace(path)
        print(sport.upper(), 'ESPN slate:', len(result['slate']['games']), 'events;', result['slate']['reference_markets'], 'gap-filling reference prices')
        return True
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(sport.upper(), 'ESPN source unavailable; retaining prior feed:', exc)
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--sport', required=True, choices=PATHS)
    main(parser.parse_args().sport)
