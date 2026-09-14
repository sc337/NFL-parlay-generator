import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

SNAPSHOT = Path('data/kalshi-nfl.json')
TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40'
ROSTER_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{}/roster'


def fetch_json(url, timeout=20):
    req = Request(url, headers={'User-Agent': 'NFL-parlay-generator/1.0', 'Accept': 'application/json'})
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode())


def norm(value):
    return re.sub(r'[^a-z0-9]', '', str(value or '').lower())


def team_index():
    raw = fetch_json(TEAMS_URL)
    entries = (((raw.get('sports') or [{}])[0].get('leagues') or [{}])[0].get('teams') or [])
    out = {}
    for entry in entries:
        team = entry.get('team') or entry
        name = team.get('displayName')
        if name and team.get('id'):
            out[name] = str(team['id'])
    return out


def flatten_roster(raw, team_name):
    players = []
    for group in raw.get('athletes') or []:
        if isinstance(group, dict) and isinstance(group.get('items'), list):
            items = group.get('items') or []
            group_position = group.get('position') or ''
        elif isinstance(group, dict):
            items = [group]
            group_position = ''
        else:
            continue
        for athlete in items:
            if not isinstance(athlete, dict):
                continue
            name = athlete.get('displayName') or athlete.get('fullName') or athlete.get('full_name')
            if not name:
                continue
            pos = athlete.get('position') or group_position or ''
            if isinstance(pos, dict):
                pos = pos.get('abbreviation') or pos.get('name') or ''
            players.append({'name': name, 'team': team_name, 'position': str(pos).upper()})
    return players


def main():
    if not SNAPSHOT.exists():
        raise SystemExit('Snapshot not found')
    data = json.loads(SNAPSHOT.read_text())
    ids = team_index()
    cache = {}

    def roster(team_name):
        if team_name in cache:
            return cache[team_name]
        team_id = ids.get(team_name)
        if not team_id:
            cache[team_name] = []
            return []
        try:
            cache[team_name] = flatten_roster(fetch_json(ROSTER_URL.format(team_id)), team_name)
        except Exception as exc:
            print('WARN roster', team_name, exc)
            cache[team_name] = []
        return cache[team_name]

    total_raw = total_verified = total_removed = 0
    games_verified = 0
    for game in data.get('games') or []:
        away, home = game.get('away'), game.get('home')
        players = roster(away) + roster(home)
        lookup = {norm(p['name']): p for p in players if p.get('name')}
        player_markets = [m for m in game.get('markets') or [] if m.get('player')]
        total_raw += len(player_markets)
        if not lookup:
            game['server_roster_status'] = 'unavailable'
            continue

        games_verified += 1
        kept = []
        valid = removed = 0
        for market in game.get('markets') or []:
            player = market.get('player')
            if not player:
                kept.append(market)
                continue
            hit = lookup.get(norm(player))
            if not hit:
                removed += 1
                total_removed += 1
                continue
            market['team'] = hit['team']
            market['position'] = hit.get('position') or ''
            market['_rosterVerified'] = True
            market['_serverRosterVerified'] = True
            market['_invalidRoster'] = False
            market['contextSource'] = 'ESPN server'
            kept.append(market)
            valid += 1
            total_verified += 1
        game['markets'] = kept
        game['server_roster_status'] = 'verified'
        game['server_roster_verification'] = {
            'raw_props': len(player_markets),
            'verified_props': valid,
            'removed_mismatches': removed,
            'roster_size': len(lookup),
        }

    data['prop_verification'] = {
        'raw_props': total_raw,
        'verified_props': total_verified,
        'removed_mismatches': total_removed,
        'games_verified': games_verified,
    }
    SNAPSHOT.write_text(json.dumps(data, separators=(',', ':')))
    print('roster verification:', total_raw, 'raw,', total_verified, 'verified,', total_removed, 'removed')


if __name__ == '__main__':
    main()
