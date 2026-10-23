"""Read-only Polymarket backup for the existing sport-specific generators.

Gamma discovers contracts; only fresh, two-sided CLOB books supply prices.
ESPN verifies the event, and existing roster evidence verifies player identity.
Exchange references retain their own settlement terms and never price an SGP.
"""
import argparse
import copy
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from .update_public_odds import adapt, healthy, resolve, slot
    from .update_ncaaf_slate import instant, number
except ImportError:
    from update_public_odds import adapt, healthy, resolve, slot
    from update_ncaaf_slate import instant, number

GAMMA = 'https://gamma-api.polymarket.com'
CLOB = 'https://clob.polymarket.com'
SPORTS = {'nfl': 'nfl', 'nba': 'nba', 'nhl': 'nhl', 'mlb': 'mlb', 'ncaaf': 'cfb', 'ufc': 'ufc'}
NFL_PROPS = {
    'passing_yards': ('player_pass_yds', 'passing', 'passing yards'),
    'rushing_yards': ('player_rush_yds', 'rushing', 'rushing yards'),
    'receiving_yards': ('player_reception_yds', 'receiving', 'receiving yards'),
    'receptions': ('player_receptions', 'receptions', 'receptions'),
    'passing_touchdowns': ('player_pass_tds', 'passing_tds', 'passing TDs'),
    'passing_completions': ('player_pass_completions', 'completions', 'completions'),
    'anytime_touchdowns': ('player_anytime_td', 'td', 'anytime TD'),
}
PROP_KINDS = {'nba': {'points', 'rebounds', 'assists', 'threes', 'pra', 'pr', 'pa', 'ra', 'steals', 'blocks'},
              'nhl': {'goals', 'assists', 'points', 'shots', 'saves'},
              'mlb': {'strikeouts', 'hits', 'home_runs', 'rbi', 'total_bases'}}
EVIDENCE = ('player', 'team', 'team_code', 'team_id', 'playerId', 'player_id', 'position',
            '_rosterVerified', '_serverRosterVerified', 'player_verified', 'contextSignals',
            'propHistory', 'propHistoryStatus', 'tdOpportunity', 'tdHistory', 'espnEvidence')
MAX_MARKETS = 160


def norm(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower())


def array(value):
    if isinstance(value, list):
        return value
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else []
    except (ValueError, TypeError):
        return []


def get(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, headers={'User-Agent': 'sports-dashboard/1.0',
                      'Accept': 'application/json', 'Content-Type': 'application/json'})
    with urlopen(request, timeout=12) as response:
        return json.load(response)


def discover(sport, now, fetch=get):
    metadata = fetch(GAMMA + '/sports')
    if not isinstance(metadata, list):
        raise ValueError('Invalid Polymarket sports metadata')
    leagues = [r for r in metadata if r.get('sport') == SPORTS[sport]]
    if len(leagues) != 1 or not str(leagues[0].get('primaryTagId', '')).isdigit():
        raise ValueError('Polymarket league identity unavailable')
    params = {'tag_id': leagues[0]['primaryTagId'], 'active': 'true', 'closed': 'false',
              'end_date_min': now.isoformat(), 'end_date_max': (now+timedelta(days=8)).isoformat(),
              'order': 'id', 'ascending': 'false', 'limit': 100}
    events = {}
    for offset in range(0, 300, 100):
        page = fetch(GAMMA + '/events?' + urlencode({**params, 'offset': offset}))
        if not isinstance(page, list):
            raise ValueError('Invalid Polymarket events schema')
        for event in page:
            if event.get('id'):
                events[str(event['id'])] = event
        if len(page) < 100:
            break
    return list(events.values())


def aliases(team):
    # Exact names or provider-supplied short names; no substring team matching.
    full = team.get('displayName') or team.get('name') or ''
    names = [full, team.get('shortDisplayName'), team.get('abbreviation'), team.get('location')]
    # Pro team event titles use the nickname. College names require exact names.
    return {norm(x) for x in names if x}


def match_event(sport, event, schedule, now):
    if event.get('active') is not True or event.get('closed') or event.get('live') or event.get('ended'):
        return None
    start = instant(event.get('startTime'))  # startDate is market creation, not kickoff.
    if not start or start <= now:
        return None
    title = re.sub(r'\s+-\s+(?:Player Props|First Touchdown Scorer)$', '', str(event.get('title', '')), flags=re.I)
    if sport == 'ufc':
        title = re.sub(r'^UFC\s+\d+:\s*', '', title)
        title = re.sub(r'\s+\([^()]+\)$', '', title)
    sides = re.split(r'\s+(?:vs\.?|at|@)\s+', title, flags=re.I)
    if len(sides) != 2:
        return None
    matches = []
    for game in schedule:
        at, checked = instant(game.get('game_time')), instant(game.get('checked_at'))
        if game.get('game_status') != 'pre' or not at or abs((at-start).total_seconds()) > 300:
            continue
        if not checked or not -300 <= (now-checked).total_seconds() <= 7200:
            continue
        if sport == 'ufc':
            if {norm(s) for s in sides} == {norm(game.get('fighter1')), norm(game.get('fighter2'))}:
                matches.append(game)
            continue
        teams = [game.get(s) or {} for s in ('away', 'home')]
        options = [aliases(t) for t in teams]
        if sport in ('nfl', 'nba', 'mlb', 'nhl'):
            for names, t in zip(options, teams):
                full = t.get('displayName') or ''
                # The canonical pro nickname comes from the ESPN display name.
                if full:
                    names.add(norm(full.split()[-1]))
                for nickname in ('Trail Blazers', 'Golden Knights', 'Maple Leafs', 'Red Wings', 'Blue Jackets', 'Red Sox', 'White Sox', 'Blue Jays'):
                    if full.endswith(nickname):
                        names.add(norm(nickname))
        keys = [norm(s) for s in sides]
        if keys[0] != keys[1] and ((keys[0] in options[0] and keys[1] in options[1]) or
                                                  (keys[0] in options[1] and keys[1] in options[0])):
            matches.append(game)
    return matches[0] if len(matches) == 1 else None


def team_side(sport, name, game):
    matches = []
    for side in ('away', 'home'):
        team = game[side]
        names = aliases(team)
        full = team.get('displayName') or ''
        if sport != 'ncaaf' and full:
            names.add(norm(full.split()[-1]))
            names.add(norm(' '.join(full.split()[-2:])))
        if norm(name) in names:
            matches.append(side)
    return matches[0] if len(matches) == 1 else None


def templates(sport, game, snapshot):
    if sport == 'nfl':
        games = [g for g in snapshot.get('games', []) if str(g.get('id')) == str(game['game_id']) and
                 instant(g.get('commence_time')) == instant(game['game_time']) and
                 all(norm(g.get(s)) == norm(game[s]['displayName']) for s in ('home', 'away'))]
        return games[0].get('markets', []) if len(games) == 1 else []
    return [m for m in snapshot.get('markets', []) if str(m.get('game_id')) == str(game['game_id'])]


def selections(sport, market, event, game, snapshot, ctx):
    if market.get('active') is not True or market.get('closed') or market.get('acceptingOrders') is not True or not market.get('enableOrderBook'):
        return []
    start = instant(market.get('gameStartTime'))
    if start != instant(event.get('startTime')):
        return []
    outcomes = array(market.get('outcomes'))
    ids = array(market.get('positionIds') if market.get('version') == 'v2' else market.get('clobTokenIds'))
    if len(ids) != 2 or len(outcomes) != 2 or len(set(map(str, ids))) != 2 or any(not str(i).isdigit() for i in ids):
        return []
    kind = market.get('sportsMarketType')
    question, description = str(market.get('question', '')), str(market.get('description', ''))
    # Full-game markets only. Require explicit OT treatment for team sports.
    if re.search(r'\b(?:1st|2nd|3rd|4th|first|second) (?:half|quarter|period)|regulation only|first [35] innings', question, re.I):
        return []
    overtime = r'overtime is included|including (?:any )?overtime|(?:including|includes?) (?:any )?extra innings'
    if sport != 'ufc' and not re.search(overtime, description, re.I):
        return []
    question_line = re.search(r'O/U\s+([0-9]+(?:\.[0-9]+)?)', question, re.I)
    if question_line and number(question_line[1]) != number(market.get('line')):
        return []
    metadata = resolve(sport, game, snapshot, ctx) if sport != 'ufc' else {'game_id': game['game_id']}
    if not metadata:
        return []
    rows = []
    line = number(market.get('line'))
    if kind in ('moneyline', 'spreads', 'totals'):
        if kind != 'moneyline' and (line is None or abs(line) % 1 != .5):
            return []  # Integer/Asian lines have different push or split rules.
        spread = re.fullmatch(r'Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)', question, re.I) if kind == 'spreads' else None
        spread_side = team_side(sport, spread[1], game) if spread and sport != 'ufc' else None
        if kind == 'spreads' and (not spread_side or number(spread[2]) != line):
            return []
        mapped = [team_side(sport, x, game) for x in outcomes] if sport != 'ufc' else []
        if kind in ('moneyline', 'spreads') and sport != 'ufc' and set(mapped) != {'home', 'away'}:
            return []
        if kind == 'totals' and {str(x).lower() for x in outcomes} != {'over', 'under'}:
            return []
        if sport == 'ufc' and (kind != 'moneyline' or {norm(x) for x in outcomes} != {norm(game['fighter1']), norm(game['fighter2'])}):
            return []
        for index, outcome in enumerate(outcomes):
            family = {'moneyline': 'moneyline', 'spreads': 'spread', 'totals': 'total'}[kind]
            side = str(outcome).lower() if kind == 'totals' else mapped[index] if mapped else None
            point = None if kind == 'moneyline' else abs(line) if kind == 'totals' else line if side == spread_side else -line
            name = game[side]['displayName'] if side in ('home', 'away') else str(outcome)
            title = name if family == 'moneyline' else name + ' ' + (format(point, '+g') if family == 'spread' else format(point, 'g'))
            raw = {'kind': family, 'side': side, 'point': point, 'team_id': str(game[side]['id']) if side in ('home', 'away') else None,
                   'team': game[side]['displayName'] if side in ('home', 'away') else None, 'label': title, 'title': title,
                   'game_id': game['game_id'], 'game_time': game['game_time'], 'game_status': 'pre',
                   'close_time': game['game_time'], 'game_label': game.get('game_label'), 'probability': None}
            if sport == 'ufc':
                row = {**raw, 'label': outcome, 'title': outcome, 'fighter1': game['fighter1'], 'fighter2': game['fighter2'],
                       'fight': game['game_label'], 'start_time': game['game_time'], 'card_name': game.get('card_name')}
            else:
                row = adapt(sport, raw, game, metadata)
            rows.append((str(ids[index]), row))
    elif kind in NFL_PROPS and sport == 'nfl' or kind in PROP_KINDS.get(sport, set()):
        player_match = re.fullmatch(r'(.+?):\s*.+', question)
        if not player_match:
            return []
        player = player_match[1]
        key, prop_type, label = NFL_PROPS[kind] if sport == 'nfl' else (kind, kind, kind.replace('_', ' '))
        td = key == 'player_anytime_td'
        if td:
            if {str(x).lower() for x in outcomes} != {'yes', 'no'}:
                return []
        elif line is None or line < 0 or line % 1 != .5 or {str(x).lower() for x in outcomes} != {'over', 'under'}:
            return []
        verified = [m for m in templates(sport, {**game, 'game_id': metadata['game_id']}, snapshot)
                    if norm(m.get('player')) == norm(player) and (m.get('_rosterVerified') is True if sport == 'nfl' else m.get('player_verified') is True)]
        if not verified or len({m.get('team') or m.get('team_code') for m in verified}) != 1:
            return []
        template = next((m for m in verified if str(m.get('marketKey') or m.get('kind')).removesuffix('_alternate') == key), verified[0])
        for index, outcome in enumerate(outcomes):
            direction = str(outcome).lower()
            if td and direction != 'yes':
                continue
            row = {k: copy.deepcopy(template[k]) for k in EVIDENCE if k in template}
            row.update(game_id=metadata['game_id'], game_time=game['game_time'], game_status='pre', close_time=game['game_time'],
                       game_label=game['game_label'], kind=prop_type, point=None if td else line, line=None if td else line,
                       title=player+' '+(label if td else direction.title()+' '+format(line, 'g')+' '+label),
                       espn_game_id=game.get('espn_game_id'), season_type=game.get('season_type'))
            row['label'] = row['title']
            if sport == 'nfl':
                row.update(type=prop_type, marketKey=key, side=direction, gameId=metadata['game_id'], kickoff=game['game_time'], name=row['title'])
            else:
                row['side'] = 'no' if direction == 'under' else 'yes'
            rows.append((str(ids[index]), row))
    return rows


def quote(book, token, condition, now):
    if not isinstance(book, dict) or str(book.get('asset_id')) != token or book.get('market') != condition:
        return None
    stamp = number(book.get('timestamp'))
    if stamp is None:
        return None
    try:
        at = datetime.fromtimestamp(stamp/1000, timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
    if not -300 <= (now-at).total_seconds() <= 1800:
        return None
    def levels(name):
        return [(number(r.get('price')), number(r.get('size'))) for r in book.get(name, [])
                if number(r.get('price')) is not None and 0 < number(r['price']) < 1
                and number(r.get('size')) is not None and number(r['size']) > 0]
    bids, asks = levels('bids'), levels('asks')
    if not bids or not asks:
        return None
    bid, ask = max(p for p, _ in bids), min(p for p, _ in asks)
    depth = sum(s for p, s in asks if p == ask)
    minimum = max(5, number(book.get('min_order_size')) or 5)
    if not 0 <= ask-bid <= .08 or depth < minimum or depth*ask < 5:
        return None
    return {'yes_bid': bid, 'yes_ask': ask, 'spread': round(ask-bid, 8), 'askDepth': depth,
            'quotedAt': at.isoformat(), 'price': round(-100*ask/(1-ask) if ask >= .5 else 100*(1-ask)/ask),
            'probability': (bid+ask)/2, 'marketProbability': ask, 'quoteProbability': ask, 'prob': ask}


def identity(sport, row, game, ctx):
    if row.get('player'):
        return ('prop', norm(row['player']), row.get('marketKey', row.get('kind')).removesuffix('_alternate'), row.get('side'), row.get('point', row.get('line')))
    if sport == 'ufc':
        return ('moneyline', norm(row.get('label')), None)
    return slot(sport, row, game, ctx)


def enrich(sport, snapshot, ctx, now, fetch=get):
    result = copy.deepcopy(snapshot)
    status = {'checked_at': now.isoformat(), 'status': 'unavailable', 'markets_added': 0, 'rejected': {}}
    result['polymarket'] = status
    schedule = result.get('slate', {}).get('games', [])
    rejected = Counter()
    try:
        events = discover(sport, now, fetch)
        candidates = []
        for event in events:
            game = match_event(sport, event, schedule, now)
            if not game:
                rejected['unmatched_or_started_event'] += 1
                continue
            for market in event.get('markets', []):
                for token, row in selections(sport, market, event, game, result, ctx):
                    candidates.append((token, row, market, game))
        # Share the bounded request budget across games. A large ALT ladder
        # for the earliest matchup must not crowd out the rest of the slate.
        candidates.sort(key=lambda x: (x[3]['game_time'], -(number(x[2].get('volumeNum')) or 0)))
        by_game = {}
        for _, _, market, game in candidates:
            by_game.setdefault(game['game_id'], {})[market['id']] = True
        queues = [list(markets) for markets in by_game.values()]
        chosen = []
        for index in range(max(map(len, queues), default=0)):
            for queue in queues:
                if index < len(queue) and len(chosen) < MAX_MARKETS:
                    chosen.append(queue[index])
        candidates = [x for x in candidates if x[2]['id'] in chosen]
        tokens = list(dict.fromkeys(x[0] for x in candidates))
        books = fetch(CLOB + '/books', [{'token_id': token} for token in tokens]) if tokens else []
        if not isinstance(books, list):
            raise ValueError('Invalid Polymarket order books schema')
        by_token = {str(b.get('asset_id')): b for b in books if isinstance(b, dict)}
        # A successful collection replaces only this source's prior rows.
        targets = [g['markets'] for g in result.get('games', [])] if sport == 'nfl' else [result.setdefault('markets', [])]
        for target in targets:
            target[:] = [m for m in target if m.get('source') != 'Polymarket']
        added = []
        for token, row, market, game in candidates:
            q = quote(by_token.get(token), token, market.get('conditionId'), now)
            if not q:
                rejected['stale_wide_or_empty_book'] += 1
                continue
            row.update(q, source='Polymarket', referenceOnly=True, sourceQuality=70,
                       volume=number(market.get('volumeNum')) or number(market.get('volume')) or 0,
                       ticker='POLY:'+str(market['id'])+':'+token, selection_id='POLY:'+str(market['id'])+':'+token,
                       event_ticker='POLY:'+str(game['game_id']), series='POLY_REFERENCE',
                       polymarket_id=str(market['id']), polymarket_token=token, polymarket_condition=market.get('conditionId'),
                       polymarket_slug=market.get('slug'), priceTimestampKnown=True,
                       settlementRules={'source': market.get('resolutionSource'), 'description': market.get('description'),
                                        'feesEnabled': market.get('feesEnabled'), 'feeSchedule': market.get('feeSchedule')},
                       referenceNote='Polymarket exchange reference; verify Caesars line, price and void rules')
            if sport == 'nfl':
                row['confidence'] = round(q['yes_ask']*100)
                target_game = next((g for g in result.get('games', []) if str(g['id']) == str(row['game_id'])), None)
                if target_game is None:
                    target_game = {'id': row['game_id'], 'home': game['home']['displayName'], 'away': game['away']['displayName'],
                                   'commence_time': game['game_time'], 'game_status': 'pre', 'dataSource': 'Public reference', 'markets': []}
                    result.setdefault('games', []).append(target_game)
                target = target_game['markets']
            else:
                target = result['markets']
            key = identity(sport, row, game, ctx)
            matching = [m for m in target if str(m.get('game_id') or m.get('gameId')) == str(row['game_id']) and identity(sport, m, game, ctx) == key]
            if any(m.get('source') == 'Polymarket' or healthy(sport, m, snapshot.get('primary_updated_at') or snapshot.get('updated_at'), now) for m in matching):
                rejected['healthy_primary_or_duplicate'] += 1
                continue
            # A verified exchange book takes precedence over ESPN's reference.
            target[:] = [m for m in target if not (m in matching and m.get('referenceOnly'))]
            target.append(row)
            added.append(row)
        status.update(status='ready' if added else 'no_qualifying_markets', events_checked=len(events),
                      candidates=len(candidates), markets_added=len(added), rejected=dict(rejected))
        if added:
            result['primary_updated_at'] = snapshot.get('primary_updated_at') or snapshot.get('updated_at')
            result['updated_at'] = now.isoformat()
        return result
    except (OSError, ValueError, TypeError, KeyError) as error:
        # Failed collection preserves earlier rows and their ORIGINAL timestamps.
        result = copy.deepcopy(snapshot)
        status.update(error=type(error).__name__, rejected=dict(rejected))
        result['polymarket'] = status
        return result


def main(sport):
    path = Path('data/kalshi-'+sport+'.json')
    snapshot = json.loads(path.read_text())
    context = Path('data/'+sport+'-context.json')
    result = enrich(sport, snapshot, json.loads(context.read_text()) if context.exists() else {}, datetime.now(timezone.utc))
    temp = path.with_suffix('.json.poly.tmp')
    temp.write_text(json.dumps(result, separators=(',', ':'))+'\n')
    temp.replace(path)
    print(sport.upper(), 'Polymarket:', json.dumps(result['polymarket']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sport', required=True, choices=SPORTS)
    main(parser.parse_args().sport)
