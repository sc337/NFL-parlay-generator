"""Add ESPN's full upcoming slate and attributed sportsbook reference prices.

No paid API, inferred prices, open-line fallback, or fabricated liquidity. The
Kalshi timestamp is retained; each external quote has its own retrieval time.
"""
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

OUTPUT = Path('data/kalshi-ncaaf.json')
BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'


def instant(value):
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def normalize(events, now):
    games, markets = {}, {}
    for event in events:
        comp = (event.get('competitions') or [{}])[0]
        status = (comp.get('status') or event.get('status') or {}).get('type') or {}
        at = instant(comp.get('date') or event.get('date'))
        sides = {c.get('homeAway'): c.get('team') or {} for c in comp.get('competitors', [])}
        if status.get('state') != 'pre' or not at or at <= now or comp.get('timeValid') is False:
            continue
        if not event.get('id') or not all(sides.get(s, {}).get('id') for s in ('home', 'away')):
            continue
        gid = str(event['id'])
        names = {s: sides[s].get('displayName') or sides[s].get('location') for s in sides}
        if not all(names.get(s) for s in ('home', 'away')):
            continue
        label = names['away'] + ' at ' + names['home']
        games[gid] = {'game_id': gid, 'game_time': at.isoformat(), 'game_status': 'pre',
                      'game_label': label, 'home': sides['home'], 'away': sides['away'],
                      'source': 'ESPN', 'checked_at': now.isoformat()}
        for book in comp.get('odds') or []:
            provider = book.get('provider') or {}
            book_name = provider.get('displayName') or provider.get('name')
            if not book_name:
                continue
            provider_id = str(provider.get('id') or re.sub(r'[^a-z0-9]', '', book_name.lower()))
            for family, kind, choices in [('moneyline', 'moneyline', ('home', 'away')),
                                           ('pointSpread', 'spread', ('home', 'away')),
                                           ('total', 'total', ('over', 'under'))]:
                for side in choices:
                    # The feed calls the current line "close", even pregame.
                    # Never substitute the opening odds when current is absent.
                    current = (book.get(family, {}).get(side) or {}).get('close') or {}
                    raw = str(current.get('odds', '')).strip().upper()
                    price = 100.0 if raw in ('EVEN', 'EV', 'EVS') else number(raw)
                    if price is None or not 100 <= abs(price) <= 100000:
                        continue
                    point = None
                    if kind != 'moneyline':
                        line = str(current.get('line', '')).lower()
                        point = number(line[1:] if kind == 'total' and line[:1] in ('o', 'u') else line)
                        if point is None or kind == 'total' and point <= 0:
                            continue
                    prob = 100 / (price + 100) if price > 0 else abs(price) / (abs(price) + 100)
                    name = names[side] if side in names else side.title()
                    title = name + ' wins' if kind == 'moneyline' else (name + ' ' + format(point, '+g') if kind == 'spread' else name + ' ' + format(point, 'g') + ' points scored')
                    ticker = ':'.join(['ESPN', gid, provider_id, kind, side, str(point)])
                    markets[ticker] = {'ticker': ticker, 'selection_id': ticker, 'event_ticker': 'ESPN-' + gid,
                        'game_id': gid, 'game_time': at.isoformat(), 'close_time': at.isoformat(),
                        'game_status': 'pre', 'game_label': label, 'kind': kind, 'label': title.removesuffix(' wins'),
                        'title': title, 'team': names.get(side), 'team_id': str(sides[side]['id']) if side in sides else None,
                        'side': side, 'point': point, 'price': price, 'probability': prob, 'yes_ask': prob,
                        'source': book_name + ' via ESPN', 'referenceOnly': True, 'quotedAt': now.isoformat(),
                        'priceTimestampKnown': False, 'sourceQuality': 65}
    return list(games.values()), list(markets.values())


def enrich(snapshot, events, now):
    games, markets = normalize(events, now)
    if not games:
        raise ValueError('ESPN returned no verified upcoming games; preserving previous slate')
    # Replace this source's previous rows; never refresh their timestamps in place.
    retained = [m for m in snapshot.get('markets', []) if not str(m.get('ticker', '')).startswith('ESPN:')]
    return {**snapshot, 'markets': retained + markets,
            'slate': {'updated_at': now.isoformat(), 'source': 'ESPN', 'games': games,
                      'reference_markets': len(markets), 'providers': sorted({m['source'] for m in markets})}}


def main():
    now = datetime.now(timezone.utc)
    dates = [(now.astimezone(ZoneInfo('America/Los_Angeles')) + timedelta(days=i)).strftime('%Y%m%d') for i in range(8)]
    def fetch_day(day):
        url = BASE + '?dates=' + day + '&groups=80&limit=500'
        with urlopen(Request(url, headers={'User-Agent': 'sports-dashboard/1.0', 'Accept': 'application/json'}), timeout=25) as res:
            return json.load(res).get('events') or []
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            events = [event for day in pool.map(fetch_day, dates) for event in day]
        snapshot = json.loads(OUTPUT.read_text())
        result = enrich(snapshot, events, now)
        temp = OUTPUT.with_suffix('.json.tmp')
        temp.write_text(json.dumps(result, indent=2) + '\n')
        temp.replace(OUTPUT)
        print('NCAAF ESPN slate:', len(result['slate']['games']), 'games;', result['slate']['reference_markets'], 'reference prices')
    except (OSError, ValueError, TypeError) as exc:
        print('NCAAF ESPN unavailable; retained prior data:', exc)


if __name__ == '__main__':
    main()
