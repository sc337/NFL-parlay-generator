"""Bounded refresh session to bridge delayed Actions schedule dispatches.

Run only in a disposable checkout. Each sport is isolated; failed refreshes keep
their original timestamps. The slow forecast settlement pipeline stays separate.
"""
import argparse
import json
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

SPORTS = ('nfl', 'mlb', 'ncaaf', 'nhl', 'ufc')
STEPS = {
    'nfl': ['update_kalshi.py', 'verify_snapshot_rosters.py',
            'enrich_snapshot_context.py', 'update_nfl_td_context.py'],
    'mlb': ['update_kalshi_mlb.py', 'update_mlb_context.py', 'attach_game_context.py'],
    'ncaaf': ['update_kalshi_ncaaf.py', 'attach_game_context.py --ncaaf', 'update_ncaaf_context.py'],
    'nhl': ['update_nhl_context.py', 'update_kalshi_nhl.py'],
    'ufc': ['update_kalshi_ufc.py'],
}
FILES = {sport: ['data/kalshi-' + sport + '.json'] +
         (['data/' + sport + '-context.json'] if sport in ('mlb', 'ncaaf', 'nhl') else [])
         for sport in SPORTS}

def stamp(payload):
    raw = payload.get('updated_at') or payload.get('generated_at')
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return dt.timestamp() if dt.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None

def valid_snapshot(payload, sport, previous=None, now=None):
    now = time.time() if now is None else now
    at = stamp(payload)
    if at is None or not now - 1800 <= at <= now + 300:
        raise ValueError(sport + ': snapshot timestamp is not fresh')
    key = 'games' if sport == 'nfl' else 'markets'
    if not isinstance(payload.get(key), list):
        raise ValueError(sport + ': invalid snapshot schema')
    if sport == 'nfl' and any(not isinstance(g.get('markets'), list) for g in payload[key]):
        raise ValueError('NFL: invalid games/markets')
    # The normalizers can return an empty collection on an upstream outage.
    # Do not replace upcoming data with that result or mark old quotes fresh.
    prior = (previous or {}).get(key, [])
    upcoming = any((stamp_time(g.get('commence_time') or g.get('game_time') or
                               g.get('start_time') or g.get('close_time')) or 0) > now
                   for g in prior)
    if not payload[key] and upcoming:
        raise ValueError(sport + ': empty refresh would remove upcoming markets')
    return payload

def stamp_time(raw):
    return stamp({'updated_at': raw})

def run(args, timeout=240):
    return subprocess.run(args, check=True, timeout=timeout)

def refresh(sport):
    saved = {name: Path(name).read_bytes() for name in FILES[sport] if Path(name).exists()}
    try:
        for step in STEPS[sport]:
            parts = step.split()
            run(['python', 'scripts/' + parts[0], *parts[1:]], timeout=180)
        name = FILES[sport][0]
        valid_snapshot(json.loads(Path(name).read_text()), sport,
                       json.loads(saved[name]) if name in saved else None)
        return True
    except Exception as error:
        print('::error title=Price refresh::' + sport + ': ' + str(error), flush=True)
        for name in FILES[sport]:
            if name in saved:
                Path(name).write_bytes(saved[name])
            else:
                Path(name).unlink(missing_ok=True)
        return False

def refresh_health(results):
    file = Path('data/dashboard-health.json')
    try:
        previous = json.loads(file.read_text()).get('refreshResults', {})
    except (OSError, ValueError):
        previous = {}
    at = datetime.now(timezone.utc).isoformat()
    previous.update({sport: {'ok': ok, 'at': at} for sport, ok in results.items()})
    failed = any(not row.get('ok') and (stamp({'updated_at': row.get('at')}) or 0) > time.time()-1800
                 for row in previous.values())
    prior_status = os.environ.get('REFRESH_STATUS')
    os.environ['REFRESH_STATUS'] = 'failure' if failed else 'success'
    try:
        run(['node', 'scripts/check_dashboard_health.js'], timeout=60)
        report = json.loads(file.read_text())
        report['refreshResults'] = previous
        file.write_text(json.dumps(report, indent=2)+'\n')
    finally:
        if prior_status is None:
            os.environ.pop('REFRESH_STATUS', None)
        else:
            os.environ['REFRESH_STATUS'] = prior_status

def publish(names, results=None):
    # Synchronize before committing and retain a newer feed from another job.
    with tempfile.TemporaryDirectory() as folder:
        saved = {name: Path(name).read_bytes() for name in names if Path(name).exists()}
        for attempt in range(3):
            run(['git', 'fetch', 'origin', 'main'])
            run(['git', 'reset', '--hard', 'origin/main'])
            selected = []
            for name, raw in saved.items():
                candidate = json.loads(raw)
                try:
                    existing = json.loads(Path(name).read_text())
                except (OSError, ValueError):
                    existing = {}
                new, old = stamp(candidate), stamp(existing)
                if new is not None and old is not None and old >= new:
                    continue
                Path(name).parent.mkdir(parents=True, exist_ok=True)
                Path(name).write_bytes(raw)
                selected.append(name)
            # Diagnose the final reconciled snapshots, including newer feeds
            # published by another worker while this cycle was running.
            if results is not None:
                refresh_health(results)
                selected.append('data/dashboard-health.json')
            if not selected:
                return
            run(['git', 'add', '--', *selected])
            if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode == 0:
                return
            run(['git', 'commit', '-m', 'Refresh sports prices independently of scheduled dispatch'])
            if subprocess.run(['git', 'push', 'origin', 'HEAD:main']).returncode == 0:
                return
        raise RuntimeError('Price publication failed after three attempts')

def cycle(publish_changes=True, sports=SPORTS):
    with ThreadPoolExecutor(max_workers=len(sports)) as pool:
        results = dict(zip(sports, pool.map(refresh, sports)))
    names = [name for sport, ok in results.items() if ok for name in FILES[sport]]
    if sports == ('nhl',):
        # NHL publication must never wait for multi-sport capture.
        if publish_changes:
            publish(names, results)
        else:
            refresh_health(results)
        return results
    try:
        run(['node', 'scripts/snapshot_daily_picks.js'], timeout=300)
        names.extend(['data/daily-picks.json', *map(str, Path('data/daily-picks').glob('*.json'))])
    except Exception as error:
        print('::error title=Recommendation capture::' + str(error), flush=True)
    if publish_changes:
        publish(names, results)
    else:
        refresh_health(results)
    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--minutes', type=int, default=0)
    parser.add_argument('--interval', type=int, default=600)
    parser.add_argument('--no-publish', action='store_true')
    parser.add_argument('--sports', nargs='+', choices=SPORTS, default=list(SPORTS))
    args = parser.parse_args()
    deadline = time.monotonic() + max(0, args.minutes) * 60
    if not args.no_publish:
        run(['git', 'config', 'user.name', 'github-actions[bot]'])
        run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    while True:
        started = time.monotonic()
        try:
            print('Refreshing sports prices', datetime.now(timezone.utc).isoformat(), flush=True)
            print(cycle(not args.no_publish, tuple(args.sports)), flush=True)
        except Exception as error:
            print('::error title=Price worker::' + str(error), flush=True)
        if time.monotonic() + args.interval >= deadline:
            break
        time.sleep(max(0, args.interval - (time.monotonic() - started)))

if __name__ == '__main__':
    main()
