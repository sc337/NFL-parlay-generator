"""Match scheduled football teams and UFC fighters to ESPN-hosted images."""
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

BASE = 'https://site.api.espn.com/apis/site/v2/sports'
OUT = Path('data/sports-media.json')

def get(url):
    req = Request(url, headers={'User-Agent': 'sports-dashboard/1.0', 'Accept': 'application/json'})
    with urlopen(req, timeout=25) as response:
        return json.load(response)

def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')).casefold()
                   if c.isalnum() and not unicodedata.combining(c))

def allowed_image(url):
    return url if isinstance(url, str) and url.startswith('https://a.espncdn.com/') else None

def college_teams():
    raw = get(BASE + '/football/college-football/teams?limit=500&groups=80')
    entries = raw.get('sports', [{}])[0].get('leagues', [{}])[0].get('teams', [])
    teams, codes = {}, {}
    for entry in entries:
        team = entry.get('team') or entry
        logo = allowed_image((team.get('logos') or [{}])[0].get('href'))
        if not logo: continue
        for field in ('displayName', 'shortDisplayName', 'name', 'abbreviation'):
            name = team.get(field)
            if name: teams.setdefault(key(name), logo)
        if team.get('abbreviation'): codes[team['abbreviation'].upper()] = logo
    return teams, codes

def ufc_photos():
    markets = json.loads(Path('data/kalshi-ufc.json').read_text()).get('markets', [])
    names = {key(m.get('label')): m['label'] for m in markets if m.get('kind') == 'moneyline'}
    dates = set()
    for market in markets:
        code = re.search(r'-([0-9]{2}[A-Z]{3}[0-9]{2})', market.get('event_ticker') or '')
        if code:
            try: dates.add(datetime.strptime(code.group(1), '%y%b%d').strftime('%Y%m%d'))
            except ValueError: pass
        close = (market.get('close_time') or '')[:10].replace('-', '')
        if len(close) == 8 and close.isdigit(): dates.add(close)
    found = {}
    for date in sorted(dates)[:20]:
        try:
            raw = get(BASE + '/mma/ufc/scoreboard?dates=' + date)
            for event in raw.get('events', []):
                for competition in event.get('competitions', []):
                    for competitor in competition.get('competitors', []):
                        athlete = competitor.get('athlete') or competitor
                        name = key(athlete.get('displayName') or athlete.get('fullName'))
                        headshot = athlete.get('headshot') or {}
                        photo = allowed_image(headshot.get('href') if isinstance(headshot, dict) else headshot)
                        espn_id = competitor.get('id') or athlete.get('id')
                        if not photo and str(espn_id or '').isdigit():
                            photo = f'https://a.espncdn.com/i/headshots/mma/players/full/{espn_id}.png'
                        if name in names and photo: found[names[name]] = photo
        except Exception as exc:
            print('UFC media', date, exc)
    return found

def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    try: college, codes = college_teams()
    except Exception as exc:
        print('College media', exc)
        college, codes = old.get('ncaaf', {}), old.get('ncaaf_codes', {})
    fighters = ufc_photos()
    fighters = {**old.get('ufc', {}), **fighters}
    OUT.write_text(json.dumps({'updated_at': datetime.now(timezone.utc).isoformat(),
                               'ncaaf': college, 'ncaaf_codes': codes, 'ufc': fighters}, indent=2))
    print('Sports media', len(college), 'college names,', len(fighters), 'fighter photos')

if __name__ == '__main__': main()
