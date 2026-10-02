"""NHL quotes only: executable sides, exact half-goal lines, verified schedule."""
import json
import math
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
try:
    from scripts.update_kalshi_mlb import get, price
except ModuleNotFoundError:
    from update_kalshi_mlb import get, price
import urllib.parse

API = 'https://external-api.kalshi.com/trade-api/v2'
SERIES = {'KXNHLGAME': 'moneyline', 'KXNHLSPREAD': 'spread', 'KXNHLTOTAL': 'total'}
PROP_SERIES = {'KXNHLGOAL': 'goals', 'KXNHLAST': 'assists', 'KXNHLPTS': 'points',
               'KXNHLSAVE': 'saves', 'KXNHLSAVES': 'saves'}
ALIASES = {'LAK': 'LA', 'SJS': 'SJ', 'TBL': 'TB', 'NJD': 'NJ', 'VEG': 'VGK', 'UTAH': 'UTA', 'MON': 'MTL', 'WAS': 'WSH'}
CODES = set('ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LA MIN MTL NJ NSH NYI NYR OTT PHI PIT SEA SJ STL TB TOR UTA VAN VGK WPG WSH'.split()) | set(ALIASES)

def code(value):
    return ALIASES.get(str(value).upper(), str(value).upper())

def event_parts(ticker):
    match = re.search(r'-(\d{2}[A-Z]{3}\d{2})(\d{4})?([A-Z]+)$', ticker or '')
    if not match:
        return None
    try:
        day = datetime.strptime(match[1], '%y%b%d').date()
    except ValueError:
        return None
    pairs = {(code(a), code(match[3][len(a):])) for a in CODES
             if match[3].startswith(a) and match[3][len(a):] in CODES}
    if len(pairs) != 1:
        return None
    return day, next(iter(pairs)), match[2]

def half_line(market, kind):
    text = ' '.join(str(market.get(k) or '') for k in ('yes_sub_title', 'subtitle', 'title'))
    pattern = r'\bover\s+(\d+(?:\.\d+)?)\s+(?:goals?|points?)' if kind == 'total' else r'\bwins by (?:over|more than)\s+(\d+(?:\.\d+)?)\s+(?:goals?|points?)'
    match = re.search(pattern, text, re.I)
    if match:
        value = float(match[1])
        # Goal scores and margins are integers: strictly over 5 is over 5.5.
        return value if value % 1 == .5 else value + .5 if value.is_integer() else None
    value = market.get('floor_strike')
    try:
        value = float(value)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    strike = market.get('strike_type')
    if strike == 'greater':
        return value if value % 1 == .5 else value + .5 if value.is_integer() else None
    if strike == 'greater_or_equal' and value.is_integer() and value > 0:
        return value - .5
    return None

def schedule_match(market, events):
    parts = event_parts(market.get('event_ticker'))
    if not parts:
        return None
    day, pair, clock = parts
    matches = []
    for event in events:
        competitors = (event.get('competitions') or [{}])[0].get('competitors') or []
        sides = {c.get('homeAway'): c.get('team') or {} for c in competitors}
        if not all(s in sides for s in ('away', 'home')):
            continue
        try:
            start = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
        except (KeyError, ValueError, TypeError):
            continue
        local = start.astimezone(ZoneInfo('America/New_York'))
        if local.date() != day or (code(sides['away'].get('abbreviation')), code(sides['home'].get('abbreviation'))) != pair:
            continue
        if clock and local.strftime('%H%M') != clock:
            continue
        matches.append((event, sides))
    return matches[0] if len(matches) == 1 else None

def normalize_market(market, series, events):
    if market.get('status') not in ('active', 'open'):
        return []
    matched = schedule_match(market, events)
    if not matched:
        return []
    event, sides = matched
    state = (event.get('status') or {}).get('type', {}).get('state')
    if state != 'pre':
        return []
    teams = [{'code': code(sides[s].get('abbreviation')), 'name': sides[s].get('displayName'),
              'short': sides[s].get('shortDisplayName') or sides[s].get('displayName'),
              'logo': sides[s].get('logo') or ''} for s in ('away', 'home')]
    kind = SERIES[series]
    tail = str(market.get('ticker') or '').rsplit('-', 1)[-1]
    selected = next((t for t in teams if re.fullmatch(r'(?:'+'|'.join(re.escape(c) for c in CODES if code(c) == t['code'])+r')\d*(?:\.\d+)?', tail)), None)
    line = half_line(market, kind) if kind != 'moneyline' else None
    if kind != 'total' and selected is None or kind != 'moneyline' and line is None:
        return []
    # ML's opposing team has its own contract. Don't duplicate it via NO.
    selections = [('yes', selected, line)]
    if kind in ('total', 'spread'):
        opposite = next((t for t in teams if t != selected), None) if kind == 'spread' else None
        selections.append(('no', opposite, line))
    rows = []
    for side, team, threshold in selections:
        ask, bid = price(market, side, 'ask'), price(market, side, 'bid')
        if ask is None or bid is None or ask < bid:
            continue
        label = team['short']+' ML' if kind == 'moneyline' else ('Over' if side == 'yes' else 'Under')+' '+str(threshold)+' goals' if kind == 'total' else team['short']+' '+('-' if side == 'yes' else '+')+str(threshold)+' Puck line'
        rows.append({'ticker': market.get('ticker'), 'event_ticker': market.get('event_ticker'), 'series': series,
                     'kind': kind, 'side': side, 'quoteSide': side, 'selection_id': str(market.get('ticker'))+'|'+side,
                     'contract_title': market.get('title'), 'label': label, 'title': label, 'line': threshold,
                     'team_code': team['code'] if team else None, 'teams': teams,
                     'probability': round((bid+ask)/2, 6), 'yes_bid': bid, 'yes_ask': ask, 'spread': round(ask-bid, 6),
                     'volume': float(market.get('volume_fp') or market.get('volume') or 0),
                     'game_id': str(event['id']), 'game_time': event['date'], 'game_status': state,
                     'game_label': teams[0]['short']+' vs '+teams[1]['short'], 'game_source': 'ESPN',
                     'season_type': (event.get('season') or {}).get('type'), 'close_time': market.get('close_time'), 'source': 'Kalshi'})
    return rows

def official_game(event, context):
    """Require the same teams and start time across ESPN and official NHL."""
    try:
        start = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
        sides = {c['homeAway']: code(c['team']['abbreviation'])
                 for c in event['competitions'][0]['competitors']}
        matches = [g for g in context.get('games', {}).values()
                   if g['away'] == sides['away'] and g['home'] == sides['home']
                   and abs((datetime.fromisoformat(g['start'])-start).total_seconds()) <= 300]
        return matches[0] if len(matches) == 1 else None
    except (KeyError, TypeError, ValueError):
        return None

def normalize_prop(market, series, events, context):
    try:
        from scripts.update_nhl_context import name_key
    except ModuleNotFoundError:
        from update_nhl_context import name_key
    if market.get('status') not in ('active', 'open'):
        return []
    matched = schedule_match(market, events)
    if not matched or matched[0].get('status', {}).get('type', {}).get('state') != 'pre':
        return []
    event, sides = matched
    game = official_game(event, context)
    if not game:
        return []
    match = re.fullmatch(r'(.+?):\s*(\d+)\+\s*(goals?|assists?|points?|saves?)', market.get('title', ''), re.I)
    if not match or int(match[2]) < 1:
        return []
    kind = PROP_SERIES[series]
    if match[3].lower().rstrip('s') != kind.rstrip('s'):
        return []
    line = int(match[2])-.5
    # An explicit strike must agree with the title; no guessed integer settlement.
    if market.get('floor_strike') is not None:
        try:
            floor = float(market['floor_strike'])
        except (TypeError, ValueError):
            return []
        expected = line if market.get('strike_type') == 'greater' else line+.5 if market.get('strike_type') == 'greater_or_equal' else None
        if expected is None or floor != expected:
            return []
    players = [p for p in context.get('rosters', []) if p['team'] in (game['away'], game['home']) and p['key'] == name_key(match[1])]
    if len(players) != 1:
        return []
    player = players[0]
    if (kind == 'saves') != (player.get('position') == 'G'):
        return []
    teams = [{'code': code(sides[s]['abbreviation']), 'name': sides[s].get('displayName'),
              'short': sides[s].get('shortDisplayName') or sides[s].get('displayName'),
              'logo': sides[s].get('logo') or ''} for s in ('away', 'home')]
    rows = []
    for side in ('yes', 'no'):
        ask, bid = price(market, side, 'ask'), price(market, side, 'bid')
        if ask is None or bid is None or ask < bid:
            continue
        label = player['name']+' '+('Over' if side == 'yes' else 'Under')+' '+str(line)+' '+kind.title()
        rows.append({'ticker': market['ticker'], 'event_ticker': market['event_ticker'], 'series': series,
            'kind': kind, 'side': side, 'quoteSide': side, 'selection_id': market['ticker']+'|'+side,
            'contract_title': market.get('title'), 'label': label, 'title': label, 'line': line,
            'player_id': player['id'], 'player': player['name'], 'player_verified': True,
            'headshot': player['headshot'], 'team_code': player['team'], 'teams': teams,
            'yes_bid': bid, 'yes_ask': ask, 'probability': round((bid+ask)/2, 6), 'spread': round(ask-bid, 6),
            'volume': float(market.get('volume_fp') or market.get('volume') or 0),
            'game_id': str(event['id']), 'context_game_id': game['id'], 'game_time': event['date'],
            'game_status': 'pre', 'game_label': teams[0]['short']+' vs '+teams[1]['short'],
            'season_type': game['season_type'], 'close_time': market.get('close_time'), 'source': 'Kalshi',
            'rules_note': 'Projection assumes participation. Confirm lineup and sportsbook settlement rules.'})
    return rows

def main():
    context_path = Path('data/nhl-context.json')
    context = json.loads(context_path.read_text()) if context_path.exists() else {}
    try:
        stamp = datetime.fromisoformat(context['updated_at'])
        if not 0 <= (datetime.now(timezone.utc)-stamp).total_seconds() <= 4*3600:
            context = {}
    except (KeyError, TypeError, ValueError):
        context = {}
    raw = []
    counts = {}
    for series in {**SERIES, **PROP_SERIES}:
        cursor = ''
        seen = set()
        counts[series] = 0
        while True:
            params = {'series_ticker': series, 'status': 'open', 'limit': 1000, 'mve_filter': 'exclude'}
            if cursor:
                params['cursor'] = cursor
            data = get(API+'/markets?'+urllib.parse.urlencode(params))
            markets = data.get('markets')
            if not isinstance(markets, list):
                raise RuntimeError('Invalid NHL market response; keeping prior snapshot')
            raw.extend((m, series) for m in markets)
            counts[series] += len(markets)
            cursor = data.get('cursor') or ''
            if not cursor:
                break
            if cursor in seen:
                raise RuntimeError('Repeated NHL cursor; keeping prior snapshot')
            seen.add(cursor)
    now = datetime.now(timezone.utc)
    days = {p[0] for m, _ in raw if (p := event_parts(m.get('event_ticker')))
            and now.date()-timedelta(days=1) <= p[0] <= now.date()+timedelta(days=14)}
    events = []
    for day in sorted(days):
        data = get('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates='+day.strftime('%Y%m%d')+'&limit=1000')
        if not isinstance(data.get('events'), list):
            raise RuntimeError('Invalid NHL schedule; keeping prior snapshot')
        events.extend(data['events'])
    rows = []
    for market, series in raw:
        selections = normalize_market(market, series, events) if series in SERIES else normalize_prop(market, series, events, context)
        for row in selections:
            if datetime.fromisoformat(row['game_time'].replace('Z', '+00:00')) <= now:
                continue
            if series in SERIES:
                matched = schedule_match(market, events)
                game = official_game(matched[0], context) if matched else None
                if game:
                    row.update(context_game_id=game['id'], season_type=game['season_type'])
            rows.append(row)
    payload = {'updated_at': now.isoformat(), 'source': 'Kalshi + ESPN', 'series_counts': counts,
               'status': 'ready', 'markets': rows}
    target = Path('data/kalshi-nhl.json')
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, indent=2))
    json.loads(temporary.read_text())
    temporary.replace(target)
    print('NHL verified pregame selections:', len(rows), counts)

if __name__ == '__main__':
    main()
