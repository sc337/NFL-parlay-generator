"""Grade saved full-game reference forecasts from verified ESPN final scores.

This evaluates forecasts, not placed wagers. Postponed, canceled, tied-moneyline,
shortened baseball and mismatched events remain pending for rule review.
"""
import json
from datetime import datetime, timezone
from urllib.request import Request, urlopen
try:
    from .update_public_odds import PATHS, instant, number
except ImportError:
    from update_public_odds import PATHS, instant, number


def fetch_summary(sport, event):
    url = 'https://site.api.espn.com/apis/site/v2/sports/'+PATHS[sport]+'/summary?event='+event
    with urlopen(Request(url, headers={'User-Agent': 'sports-dashboard/1.0'}), timeout=15) as r:
        return json.load(r)


def grade(contract, summary):
    if contract.get('scope') != 'full_game' or contract.get('kind') not in ('moneyline', 'spread', 'total'):
        return None
    comps = (summary.get('header') or {}).get('competitions') or []
    comp = next((c for c in comps if str(c.get('id')) == str(contract.get('eventId'))), None)
    if not comp:
        return None
    status = (comp.get('status') or {}).get('type') or {}
    if not status.get('completed') or not str(status.get('name', '')).startswith('STATUS_FINAL'):
        return None
    sides = comp.get('competitors') or []
    ids = [str((s.get('team') or {}).get('id') or s.get('id') or '') for s in sides]
    if len(ids) != 2 or sorted(ids) != sorted(contract.get('teams') or []):
        return None
    start, expected = instant(comp.get('date')), instant(contract.get('eventTime'))
    if not start or not expected or abs((start-expected).total_seconds()) > 300:
        return None
    if contract.get('sport') == 'mlb':
        innings = number((comp.get('status') or {}).get('period'))
        lines = max([len(s.get('linescores') or []) for s in sides] or [0])
        if max(innings or 0, lines) < 9:
            return None
    values = []
    for s in sides:
        raw = s.get('score');value = number(raw.get('value') if isinstance(raw, dict) else raw)
        if value is None or value < 0 or int(value) != value:
            return None
        values.append(value)
    kind = contract['kind'];line = number(contract.get('line'))
    if kind == 'total':
        if line is None or contract.get('direction') not in ('over', 'under'):
            return None
        margin = (sum(values)-line)*(1 if contract['direction'] == 'over' else -1)
    else:
        if contract.get('teamId') not in ids:
            return None
        i = ids.index(contract['teamId']);margin = values[i]-values[1-i]
        if kind == 'moneyline' and margin == 0:
            return None
        if kind == 'spread':
            if line is None:
                return None
            margin += line
    return 'win' if margin > 0 else 'loss' if margin < 0 else 'push'


def settle_references(records, fetch=fetch_summary, now=None, limit=60):
    now = now or datetime.now(timezone.utc);cache = {};changed = 0
    for row in records:
        c = row.get('settlement') or {}
        if row.get('result') or c.get('provider') != 'ESPN' or c.get('sport') not in PATHS:
            continue
        start = instant(row.get('eventTime'));recorded = instant(row.get('recordedAt') or row.get('capturedAt'))
        if not start or start >= now or not recorded or recorded >= start:
            continue
        key = c['sport'], str(c['eventId'])
        if key not in cache:
            if len(cache) >= limit:
                continue
            try:
                cache[key] = fetch(*key)
            except (OSError, ValueError):
                cache[key] = {}
        result = grade(c, cache[key])
        if result:
            row.update(result=result, settledAt=now.isoformat(), settlementSource='ESPN verified final score; full-game reference rules')
            changed += 1
    return changed
