"""Refresh pregame NCAAF context from free, cached score/box-score/weather sources.

Only completed games strictly before the upcoming kickoff enter the model.
Failure leaves the previous context intact; no fabricated values are published.
"""
import csv
import io
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SNAPSHOT = Path('data/kalshi-ncaaf.json')
OUTPUT = Path('data/ncaaf-context.json')
ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
BOX = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_team_box/team_box_{}.csv'
AGENT = 'NFL-parlay-generator/1.0 (https://github.com/sc337/NFL-parlay-generator)'


def fetch(url, timeout=20):
    with urlopen(Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/json,text/csv'}), timeout=timeout) as res:
        return res.read().decode('utf-8-sig')


def instant(s):
    try:
        return datetime.fromisoformat(str(s).replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def scoreboard(season, week):
    # ESPN silently falls back to 25 games at limit=1000; 500 returns the full week.
    url = ESPN + '?' + urlencode({'dates': season, 'week': week, 'seasontype': 2, 'groups': 80, 'limit': 500})
    return json.loads(fetch(url)).get('events') or []


def completed(event, now):
    comp = (event.get('competitions') or [{}])[0]
    status = (comp.get('status') or event.get('status') or {}).get('type') or {}
    start = instant(event.get('date'))
    sides = comp.get('competitors') or []
    if not status.get('completed') or not start or start >= now or len(sides) != 2:
        return None
    try:
        values = {str(c['team']['id']): float(c['score']['value'] if isinstance(c['score'], dict) else c['score']) for c in sides}
    except (KeyError, ValueError, TypeError):
        return None
    return values if len(values) == 2 else None


def box_rows(season):
    raw = fetch(BOX.format(season), timeout=30)
    rows = {}
    for row in csv.DictReader(io.StringIO(raw)):
        game, team = row.get('game_id'), row.get('team_id')
        if game and team:
            rows[(str(game), str(team))] = row
    return rows


def number(value):
    try:
        result = float(value)
        return result if result == result else None
    except (ValueError, TypeError):
        return None


def summary(team_id, games):
    rows = sorted(games.get(str(team_id), []), key=lambda g: g['date'])[-6:]
    if len(rows) < 3:
        return {'games': len(rows), 'available': False}
    avg = lambda key: round(sum(g[key] for g in rows) / len(rows), 2)
    boxes = [g for g in rows if g.get('yards') is not None and g.get('allowed_yards') is not None]
    result = {'available': True, 'games': len(rows), 'points_for': avg('points'),
              'points_against': avg('allowed'), 'margin': avg('margin'),
              'last_game': rows[-1]['date'], 'box_games': len(boxes)}
    if len(boxes) >= 2:
        result['yards_for'] = round(sum(g['yards'] for g in boxes) / len(boxes), 1)
        result['yards_against'] = round(sum(g['allowed_yards'] for g in boxes) / len(boxes), 1)
        result['turnovers'] = round(sum(g['turnovers'] for g in boxes) / len(boxes), 2)
    return result


def read_games(events, boxes, now):
    games = {}
    for event in events:
        scores = completed(event, now)
        if not scores:
            continue
        sides = list(scores)
        start = instant(event['date'])
        for team in sides:
            opponent = next(x for x in sides if x != team)
            box = boxes.get((str(event['id']), team), {})
            other = boxes.get((str(event['id']), opponent), {})
            yards, against = number(box.get('totalYards')), number(other.get('totalYards'))
            games.setdefault(team, []).append({'date': start.isoformat(), 'points': scores[team],
                'allowed': scores[opponent], 'margin': scores[team] - scores[opponent],
                'yards': yards, 'allowed_yards': against, 'turnovers': number(box.get('turnovers')) or 0})
    return games


def college_name(value):
    name = re.sub(r'[^a-z0-9]', '', str(value or '').lower()).replace('state', 'st').replace('saint', 'st')
    return {'westernky': 'westernkentucky', 'easternky': 'easternkentucky',
            'northernill': 'northernillinois', 'southernmiss': 'southernmississippi'}.get(name, name)


def match_event(game_id, rows, by_id, events, kickoff):
    if game_id in by_id:
        return by_id[game_id]
    labels = {r.get('game_label') for r in rows if r.get('game_label')}
    if len(labels) != 1:
        return None
    names = re.split(r'\s+at\s+', labels.pop(), maxsplit=1, flags=re.I)
    if len(names) != 2:
        return None
    names = [college_name(n) for n in names]
    matches = []
    for event in events:
        start = instant(event.get('date'))
        if not start or abs((start-kickoff).total_seconds()) > 3*3600:
            continue
        sides = (event.get('competitions') or [{}])[0].get('competitors') or []
        if len(sides) != 2:
            continue
        def aliases(c):
            t = c.get('team') or {}
            return {college_name(t.get(k)) for k in ('displayName', 'location', 'shortDisplayName')}
        away = next((c for c in sides if c.get('homeAway') == 'away'), None)
        home = next((c for c in sides if c.get('homeAway') == 'home'), None)
        if away and home and names[0] in aliases(away) and names[1] in aliases(home):
            matches.append(event)
    return matches[0] if len(matches) == 1 else None


def geocode(city, state):
    if not city or not state:
        return None
    url = 'https://geocoding-api.open-meteo.com/v1/search?' + urlencode({'name': city + ', ' + state, 'count': 5, 'countryCode': 'US'})
    try:
        results = json.loads(fetch(url)).get('results') or []
        # The API's first match is not always the named municipality.
        hit = next((x for x in results if x.get('name', '').casefold() == city.casefold()), None)
        if hit and -125 < hit['longitude'] < -66 and 24 < hit['latitude'] < 50:
            return round(hit['latitude'], 4), round(hit['longitude'], 4)
    except (KeyError, TypeError, ValueError, OSError) as exc:
        print('NCAAF geocode unavailable', city, exc)
    return None


def weather(venue, kickoff, now):
    if venue.get('indoor') is True:
        return {'indoor': True, 'source': 'ESPN venue'}
    if venue.get('indoor') is not False or not now < kickoff <= now + timedelta(hours=72):
        return None
    address = venue.get('address') or {}
    point = geocode(address.get('city'), address.get('state'))
    if not point:
        return None
    try:
        meta = json.loads(fetch('https://api.weather.gov/points/{},{}'.format(*point)))
        forecast = (meta.get('properties') or {}).get('forecastHourly')
        if not forecast or not forecast.startswith('https://api.weather.gov/'):
            return None
        periods = (json.loads(fetch(forecast)).get('properties') or {}).get('periods') or []
        period = next((p for p in periods if instant(p.get('startTime')) and instant(p.get('endTime'))
                       and instant(p['startTime']) <= kickoff < instant(p['endTime'])), None)
        if not period:
            return None
        wind = re.search(r'\d+', str(period.get('windSpeed') or ''))
        return {'indoor': False, 'wind_mph': int(wind.group()) if wind else None,
                'precip_probability': (period.get('probabilityOfPrecipitation') or {}).get('value'),
                'forecast_at': period.get('startTime'), 'source': 'NWS (city forecast)'}
    except (ValueError, TypeError, OSError) as exc:
        print('NCAAF weather unavailable', address.get('city'), exc)
    return None


def build(snapshot, events, boxes, now, weather_fn=weather):
    by_id = {str(e.get('id')): e for e in events if e.get('id')}
    games = read_games(events, boxes, now)
    upcoming = {str(m['game_id']): instant(m.get('game_time')) for m in snapshot.get('markets', [])
                if m.get('game_id') and instant(m.get('game_time')) and instant(m['game_time']) > now}
    market_groups = {}
    for m in snapshot.get('markets', []):
        if m.get('game_id'):
            market_groups.setdefault(str(m['game_id']), []).append(m)
    output = {}
    for game_id, kickoff in upcoming.items():
        ev = match_event(game_id, market_groups.get(game_id, []), by_id, events, kickoff)
        if not ev:
            continue
        comp = (ev.get('competitions') or [{}])[0]
        sides = comp.get('competitors') or []
        home = next((c for c in sides if c.get('homeAway') == 'home'), None)
        away = next((c for c in sides if c.get('homeAway') == 'away'), None)
        if not home or not away:
            continue
        def team(c):
            info = c.get('team') or {}
            return {'id': str(info.get('id')), 'name': info.get('displayName'),
                    'aliases': [info.get(k) for k in ('displayName', 'location', 'shortDisplayName') if info.get(k)],
                    'form': summary(info.get('id'), {k: [g for g in v if instant(g['date']) < kickoff] for k, v in games.items()})}
        venue = comp.get('venue') or {}
        record = {'game_id': game_id, 'kickoff': kickoff.isoformat(), 'home': team(home), 'away': team(away),
                  'neutral_site': comp.get('neutralSite') is True,
                  'venue': {'name': venue.get('fullName'), 'indoor': venue.get('indoor')},
                  'sources': ['ESPN completed scores', 'SportsDataverse team box scores' if boxes else 'ESPN completed scores only']}
        wx = weather_fn(venue, kickoff, now)
        if wx:
            record['weather'] = wx
        output[game_id] = record
    points = [g['points'] for rows in games.values() for g in rows]
    return {'updated_at': now.isoformat(), 'games': output,
            'league_points_per_team': round(sum(points) / len(points), 2) if points else None,
            'sources': ['ESPN', 'SportsDataverse' if boxes else 'ESPN scores only', 'NWS when available']}


def main(now=None):
    now = now or datetime.now(timezone.utc)
    snapshot = json.loads(SNAPSHOT.read_text())
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    updated = instant(previous.get('updated_at'))
    needed = {str(m.get('game_id')) for m in snapshot.get('markets', []) if m.get('game_id') and instant(m.get('game_time')) and instant(m['game_time']) > now}
    if updated and now - updated < timedelta(hours=3):
        print('NCAAF context cache fresh; skipped refresh')
        return
    season = now.year
    latest = max([instant(m.get('game_time')) for m in snapshot.get('markets', []) if instant(m.get('game_time'))] or [now])
    first_saturday = datetime(season, 8, 31, tzinfo=timezone.utc)
    while first_saturday.weekday() != 5:
        first_saturday -= timedelta(days=1)
    last_week = min(17, max(1, (latest - first_saturday).days // 7 + 2))
    events = []
    for week in range(1, last_week + 1):
        try:
            events.extend(scoreboard(season, week))
        except (ValueError, OSError) as exc:
            print('NCAAF scoreboard week unavailable', week, exc)
    events = list({str(e['id']): e for e in events if e.get('id')}.values())
    if not events:
        print('NCAAF context: ESPN unavailable, preserving previous snapshot')
        return
    try:
        boxes = box_rows(season)
    except (ValueError, OSError) as exc:
        print('NCAAF SportsDataverse unavailable, scores only', exc)
        boxes = {}
    result = build(snapshot, events, boxes, now)
    if needed and not result['games']:
        print('NCAAF context: no matched upcoming games; preserving previous snapshot')
        return
    OUTPUT.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print('NCAAF context', len(result['games']), 'pregame games;', len(boxes), 'team box rows')


if __name__ == '__main__':
    main()
