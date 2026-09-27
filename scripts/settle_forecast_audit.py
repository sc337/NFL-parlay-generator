"""Settle the prospective audit archive and attach final NFL game totals."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from .settle_pick_history import settle_records
except ImportError:
    from settle_pick_history import settle_records

FILE = Path(__file__).resolve().parent.parent / 'data/forecast-audit.json'
SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?'


def final_total(event_id):
    req = Request(SUMMARY + urlencode({'event': event_id}),
                  headers={'User-Agent': 'sports-dashboard/1.0'})
    with urlopen(req, timeout=15) as response:
        data = json.load(response)
    comp = ((data.get('header') or {}).get('competitions') or [{}])[0]
    status = (comp.get('status') or {}).get('type') or {}
    if not status.get('completed'):
        return None
    competitors = comp.get('competitors') or []
    if len(competitors) != 2:
        return None
    try:
        def score(c):
            value = c['score']
            return int(value.get('value') if isinstance(value, dict) else value)
        return sum(score(c) for c in competitors)
    except (KeyError, ValueError, TypeError):
        return None


def add_nfl_totals(records, fetch=final_total, now=None):
    now = now or datetime.now(timezone.utc)
    cache = {}
    changed = 0
    for row in records:
        if row.get('sport') != 'nfl' or row.get('marketGroup') != 'totals' or \
           row.get('actualTotal') is not None or not row.get('eventId'):
            continue
        try:
            kickoff = datetime.fromisoformat(row['eventTime'].replace('Z', '+00:00'))
        except (KeyError, ValueError, TypeError):
            continue
        if kickoff + timedelta(hours=2) > now:
            continue
        event = row['eventId']
        if event not in cache:
            try:
                cache[event] = fetch(event)
            except Exception as error:
                print('NFL score lookup deferred:', event, error)
                cache[event] = None
        if cache[event] is not None:
            row['actualTotal'] = cache[event]
            changed += 1
    return changed


def main():
    if not FILE.exists():
        return
    payload = json.loads(FILE.read_text())
    records = payload.get('records', [])
    changed = settle_records(records, limit=100) + add_nfl_totals(records)
    if changed:
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        FILE.write_text(json.dumps(payload, indent=2) + '\n')
    print('Audit outcomes updated', changed)


if __name__ == '__main__':
    main()
