"""Dated injury monitoring and completed-game usage, attached to exact players.

Absence from an injury feed is never interpreted as confirmation of availability.
Only a unique exact name AND team match can annotate a market across ID systems.
"""
import argparse
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
try:
    from .update_public_odds import PATHS, instant
except ImportError:
    from update_public_odds import PATHS, instant


def key(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower())


def get(url):
    with urlopen(Request(url, headers={'User-Agent': 'sports-dashboard/1.0'}), timeout=15) as r:
        return json.load(r)


def injuries(payload, now):
    if not isinstance(payload.get('injuries'), list) or payload.get('status') not in (None, 'success'):
        raise ValueError('Invalid injury feed')
    output = []
    for block in payload['injuries']:
        for r in block.get('injuries', []):
            a = r.get('athlete') or {};team = a.get('team') or {}
            name = a.get('displayName');status = r.get('status');reported = instant(r.get('date'))
            if not name or not status or not reported or reported > now+timedelta(minutes=5):
                continue
            output.append({'name': name, 'team': team.get('displayName') or block.get('displayName'),
                           'team_code': team.get('abbreviation'), 'status': status, 'reportedAt': reported.isoformat(),
                           'position': (a.get('position') or {}).get('abbreviation'), 'detail': r.get('shortComment', ''), 'source': 'ESPN injury report'})
    return output


def observations(summary, now):
    comp = ((summary.get('header') or {}).get('competitions') or [{}])[0]
    status = (comp.get('status') or {}).get('type') or {};date = instant(comp.get('date'))
    if not status.get('completed') or not str(status.get('name', '')).startswith('STATUS_FINAL') or not date or date >= now:
        return []
    season = (summary.get('header') or {}).get('season', {}).get('type')
    if season not in (2, 3):
        return []
    output = []
    for team in summary.get('boxscore', {}).get('players', []):
        t = team.get('team') or {}
        for group in team.get('statistics', []):
            labels = group.get('labels') or []
            for row in group.get('athletes', []):
                a = row.get('athlete') or {}
                if row.get('didNotPlay') or not a.get('displayName'):
                    continue
                stats = dict(zip(labels, row.get('stats') or []))
                for metric in ('MIN', 'TOI', 'AB', 'PA', 'ATT', 'CAR', 'TGTS', 'TAR', 'C/ATT', 'PC-ST'):
                    raw = stats.get(metric)
                    if raw is None:
                        continue
                    try:
                        if metric == 'C/ATT':
                            raw = str(raw).split('/')[-1]
                        if metric == 'PC-ST':
                            raw = str(raw).split('-')[0]
                        parts = str(raw).split(':');value = float(parts[0])+(float(parts[1])/60 if len(parts) == 2 else 0)
                    except (ValueError, TypeError):
                        continue
                    output.append({'name': a['displayName'], 'team': t.get('displayName'), 'team_code': t.get('abbreviation'),
                                   'date': date.isoformat(), 'eventId': str(comp.get('id')), 'metric': {'C/ATT':'player_pass_attempts','CAR':'player_rush_attempts','TGTS':'targets','TAR':'targets','PC-ST':'pitches'}.get(metric, metric),
                                   'value': value, 'source': 'ESPN completed box score'})
    return output


def native_usage(sport, snapshot, ctx, now):
    rows = []
    if sport == 'nba':
        updated = instant(ctx.get('updated_at'))
        if not updated or now-updated > timedelta(hours=6):
            return []
        codes = {t.get('code'): t.get('name') for m in snapshot.get('markets', []) for t in m.get('teams', [])}
        for p in ctx.get('players', {}).values():
            for g in p.get('games', []):
                date = instant(g.get('date'))
                if g.get('season_type') not in (2, 3) or not date or date >= now or date < now-timedelta(days=45) or g.get('team') != p.get('team') or not isinstance(g.get('minutes'), (float, int)):
                    continue
                rows.append({'name': p['name'], 'team': codes.get(p.get('team')), 'team_code': p.get('team'),
                             'date': date.isoformat(), 'metric': 'MIN', 'value': g['minutes'], 'source': 'ESPN completed NBA box scores'})
    if sport == 'nfl':
        # Existing NFL opportunity history is already date-checked and sourced.
        # Retain its provenance rather than relabel nflverse data as ESPN.
        for game in snapshot.get('games', []):
            for m in game.get('markets', []):
                h = m.get('propHistory') or {};dates = h.get('dates') or []
                opportunity = h.get('opportunities') or {}
                metric = 'targets' if m.get('type') in ('receiving', 'receptions') or m.get('type') == 'td' and m.get('position') in ('WR','TE') else 'player_rush_attempts' if m.get('type') == 'rushing' or m.get('type') == 'td' and m.get('position') in ('RB','QB') else 'player_pass_attempts'
                values = opportunity.get(metric) or []
                if len(dates) != len(values):
                    continue
                for date, value in zip(dates, values):
                    when = instant(date)
                    if when and when < now:
                        rows.append({'name': m.get('player'), 'team': m.get('team'), 'date': when.isoformat(),
                                     'metric': metric, 'value': value, 'source': h.get('source', 'Existing verified opportunity history')})
    return rows


def annotate(snapshot, reports, usage, now, availability_ok=True):
    output = json.loads(json.dumps(snapshot));previous = snapshot.get('espn_evidence') or {}
    associations = [(m, [g.get('away'), g.get('home')], g.get('commence_time')) for g in output.get('games', []) for m in g.get('markets', [])] if 'games' in output else [(m, str(m.get('game_label') or '').split(' at '), m.get('game_time')) for m in output.get('markets', [])]
    changes = list(previous.get('changes') or [])[-40:];old_status = previous.get('statuses') or {};statuses = {}
    for r in reports:
        k = key(r['name'])+'|'+key(r.get('team'))
        statuses[k] = r['status']
        if k in old_status and old_status[k] != r['status']:
            changes.append({'player': r['name'], 'team': r['team'], 'before': old_status[k], 'after': r['status'], 'checkedAt': now.isoformat()})
    for m, game_teams, event_time in associations:
        player = m.get('player') or (str(m.get('label') or '').split(':', 1)[0] if m.get('kind') not in ('moneyline','spread','total') and ':' in str(m.get('label')) else None)
        if not player:
            alerts = [r for r in reports if r.get('position') == 'QB' and any(key(r.get('team')) == key(t) for t in game_teams if t) and now-timedelta(days=14) < instant(r['reportedAt']) <= now]
            if alerts and availability_ok:
                m['espnEvidence'] = {'checkedAt': now.isoformat(), 'teamAlerts': alerts}
            continue
        teams = [t for t in m.get('teams', []) if t.get('code') == m.get('team_code')]
        team = m.get('team') if m.get('team') not in (None, 'Player', 'Game') else teams[0].get('name') if len(teams) == 1 else None
        if team is None and ':' in str(m.get('label')):
            try:
                from .attach_game_context import MLB
            except ImportError:
                from attach_game_context import MLB
            symbol = str(m.get('ticker') or '').removeprefix(str(m.get('event_ticker') or '')+'-').split('-')[0]
            matches = {t for code, name in MLB.items() for t in game_teams if symbol.startswith(code) and str(t).endswith(name)}
            team = next(iter(matches)) if len(matches) == 1 else None
        name = key(player)
        def match(r):
            return key(r.get('name')) == name and team is not None and key(r.get('team')) == key(team)
        hits = [r for r in reports if match(r)]
        # Do not erase a dated earlier check when the source is unavailable.
        if not availability_ok:
            if not m.get('espnEvidence'):
                m['espnEvidence'] = {'player':player,'team':team,'eventTime':event_time,'checkedAt':previous.get('checkedAt'),'sourceUnavailable':True}
            continue
        evidence = {'player': player, 'team': team, 'checkedAt': now.isoformat(), 'eventTime': event_time,
                    'availability': {k:hits[0].get(k) for k in ('name','status','reportedAt','source')} if len(hits) == 1 else None, 'usage': None}
        samples = [r for r in usage if match(r) and instant(r.get('date')) and now-timedelta(days=45) < instant(r['date']) < now]
        metric = ('MIN' if m.get('kind') in ('points', 'rebounds', 'assists', 'threes', 'pra', 'pr', 'pa', 'ra', 'blocks', 'steals') and any(r['metric'] == 'MIN' for r in samples)
                  else 'TOI' if any(r['metric'] == 'TOI' for r in samples) else 'pitches' if m.get('kind') == 'strikeouts' and any(r['metric'] == 'pitches' for r in samples) else 'AB' if any(r['metric'] == 'AB' for r in samples) else None)
        if not metric and samples:
            desired = 'targets' if m.get('type') in ('receiving', 'receptions') or m.get('type') == 'td' and m.get('position') in ('WR','TE') else 'player_rush_attempts' if m.get('type') == 'rushing' or m.get('type') == 'td' and m.get('position') in ('RB','QB') else 'player_pass_attempts'
            metric = desired if any(r['metric'] == desired for r in samples) else samples[0]['metric']
        if metric:
            chosen = {r['date']: r for r in samples if r['metric'] == metric}
            evidence['usage'] = {'metric': metric, 'source': next(iter(chosen.values())).get('source'), 'rows': [{k:r[k] for k in ('date','value')} for r in sorted(chosen.values(), key=lambda r:r['date'])[-8:]]}
        m['espnEvidence'] = evidence
    output['espn_evidence'] = {'checkedAt': now.isoformat() if availability_ok else previous.get('checkedAt'),
        'availabilityStatus': 'checked; absent players remain unconfirmed' if availability_ok else 'unavailable',
        'statuses': statuses if availability_ok else old_status, 'changes': changes[-40:],
        'usageCheckedAt': now.isoformat(), 'usageRows': usage, 'source': 'Dated ESPN injuries and completed-game usage'}
    return output


def recent_usage(sport, snapshot, previous, now):
    at = instant(previous.get('usageCheckedAt'))
    if at and now-at < timedelta(hours=3) and previous.get('usageRows'):
        return previous.get('usageRows') or []
    markets = snapshot.get('markets', [])
    needed = {m.get('team_code') for m in markets if m.get('player')}
    if sport == 'mlb':
        try:
            from .attach_game_context import MLB
        except ImportError:
            from attach_game_context import MLB
        needed.update(code for m in markets if ':' in str(m.get('label')) for code in MLB if str(m.get('ticker') or '').removeprefix(str(m.get('event_ticker') or '')+'-').split('-')[0].startswith(code))
    games = snapshot.get('slate', {}).get('games', [])
    teams = {str(g[side]['id']) for g in games for side in ('home', 'away') if side in g and
             instant(g.get('game_time')) and instant(g['game_time']) < now+timedelta(days=3) and g[side].get('abbreviation') in needed}
    base = 'https://site.api.espn.com/apis/site/v2/sports/'+PATHS[sport]
    def schedule(tid):
        try:
            events = get(base+'/teams/'+tid+'/schedule').get('events') or []
            return [e for e in events if instant(e.get('date')) and now-timedelta(days=45) < instant(e['date']) < now and
                    ((e.get('competitions') or [{}])[0].get('status') or {}).get('type', {}).get('completed')][-6:]
        except (OSError, ValueError):
            return []
    with ThreadPoolExecutor(max_workers=6) as pool:
        schedules = list(pool.map(schedule, teams))
    ids = []
    # Round-robin across teams so the bounded refresh never favors one roster.
    for i in range(6):
        for games in schedules:
            if len(games) > i and str(games[-1-i]['id']) not in ids:
                ids.append(str(games[-1-i]['id']))
    def summary(eid):
        try:
            return observations(get(base+'/summary?event='+eid), now)
        except (OSError, ValueError):
            return []
    with ThreadPoolExecutor(max_workers=6) as pool:
        return [r for batch in pool.map(summary, ids[:48]) for r in batch]


def main(sport):
    path = Path('data/kalshi-'+sport+'.json');now = datetime.now(timezone.utc)
    snapshot = json.loads(path.read_text());ctx_path = Path('data/'+sport+'-context.json')
    ctx = json.loads(ctx_path.read_text()) if ctx_path.exists() else {}
    if sport == 'ufc':
        return
    try:
        reports = injuries(get('https://site.api.espn.com/apis/site/v2/sports/'+PATHS[sport]+'/injuries'), now);ok = True
    except (OSError, ValueError):
        reports = [];ok = False
    usage = native_usage(sport, snapshot, ctx, now)
    if sport in ('nhl', 'mlb', 'ncaaf'):
        usage += recent_usage(sport, snapshot, snapshot.get('espn_evidence') or {}, now)
    usage = list({(r.get('name'),r.get('team'),r.get('metric'),r.get('date')):r for r in usage}.values())
    result = annotate(snapshot, reports, usage, now, ok)
    temp = path.with_suffix('.json.tmp');temp.write_text(json.dumps(result, separators=(',', ':'))+'\n');temp.replace(path)
    print(sport, 'availability reports', len(reports), 'usage observations', len(usage))


if __name__ == '__main__':
    p = argparse.ArgumentParser();p.add_argument('--sport', choices=PATHS, required=True);main(p.parse_args().sport)
