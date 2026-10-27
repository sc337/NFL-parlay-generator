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

SPORTS = ('mlb', 'nba', 'ncaaf', 'nfl', 'nhl', 'ufc')
STEPS = {
    'nba': ['update_kalshi_nba.py'],
    'nfl': ['update_kalshi.py', 'verify_snapshot_rosters.py'],
    'mlb': ['update_kalshi_mlb.py', 'update_mlb_context.py', 'attach_game_context.py'],
    'ncaaf': ['update_kalshi_ncaaf.py', 'attach_game_context.py --ncaaf'],
    'nhl': ['update_nhl_context.py', 'update_kalshi_nhl.py'],
    'ufc': ['update_kalshi_ufc.py'],
}
FILES = {sport: ['data/kalshi-' + sport + '.json'] +
         (['data/' + sport + '-context.json'] if sport in ('mlb', 'nba', 'ncaaf', 'nhl') else [])
         for sport in SPORTS}

def stamp(payload):
    raw = payload.get('updated_at') or payload.get('generated_at')
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return dt.timestamp() if dt.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None

def reconcile_evidence(candidate, existing, now=None):
    """Keep fresh, richer UFC evidence when an older collector publishes new prices."""
    if not isinstance(candidate.get('fighter_stats'), dict):
        return candidate
    now = time.time() if now is None else now
    profiles = dict(candidate['fighter_stats'])
    names = {m.get(key) for m in candidate.get('markets', []) for key in ('fighter1', 'fighter2')}
    for name, prior in (existing.get('fighter_stats') or {}).items():
        if name not in names or prior.get('identity_verified') is not True:
            continue
        at = stamp({'updated_at': prior.get('fetched_at')})
        if at is None or not now - 48 * 3600 <= at <= now + 300:
            continue
        fresh = profiles.get(name) or {}
        version, previous_version = fresh.get('profile_version') or 0, prior.get('profile_version') or 0
        current_at = stamp({'updated_at': fresh.get('fetched_at')})
        if (not fresh or fresh.get('identity_verified') is not True or previous_version > version
                or previous_version == version and (current_at is None or current_at < at)):
            profiles[name] = prior
    return {**candidate, 'fighter_stats': profiles}

def valid_snapshot(payload, sport, previous=None, now=None):
    now = time.time() if now is None else now
    at = stamp(payload)
    if at is None or not now - 1800 <= at <= now + 300:
        raise ValueError(sport + ': snapshot timestamp is not fresh')
    if sport == 'nfl':
        native_at = stamp_time(payload.get('primary_updated_at')) if 'primary_updated_at' in payload else at
        if native_at is None or not now - 1800 <= native_at <= now + 300:
            # Fresh verified order books can recover missing primary coverage.
            backup = any(m.get('source') == 'Polymarket' and m.get('referenceOnly') is True
                         and m.get('polymarket_token') and m.get('askDepth', 0) >= 5
                         and 0 < (m.get('yes_ask') or 0) < 1
                         and 0 <= (m.get('spread') if m.get('spread') is not None else 1) <= .08
                         and now - 1800 <= (stamp_time(m.get('quotedAt')) or 0) <= now + 300
                         and (stamp_time(g.get('commence_time')) or 0) > now
                         for g in payload.get('games', []) for m in g.get('markets', []))
            if not backup:
                raise ValueError('nfl: native prices are delayed; reference metadata is not a successful price refresh')
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

def reconcile_snapshot(candidate, existing):
    """Publish metadata and native quote captures independently.

    A public-reference refresh advances updated_at, not primary_updated_at.
    Select a whole native capture so removed/suspended contracts stay removed;
    never retimestamp individual quotes or resurrect contracts by merging prices.
    """
    if not existing:
        return candidate
    newer = (stamp(candidate) or 0) > (stamp(existing) or 0)
    base, other = (candidate, existing) if newer else (existing, candidate)
    def capture(payload):
        return stamp_time(payload.get('primary_updated_at')) or stamp(payload) or 0
    native = candidate if capture(candidate) > capture(existing) else existing if capture(existing) > capture(candidate) else base
    if native is base or not isinstance(base.get('games'), list) or not isinstance(native.get('games'), list):
        return reconcile_evidence(base, other)
    # NFL native games are the authority for contract membership. The latest
    # reference collection can still add independent, explicitly dated quotes.
    references = {g.get('id'): g for g in base['games']}
    games = []
    for game in native['games']:
        recent = references.pop(game.get('id'), {})
        merged = {**game}
        if (stamp(recent.get('context') or {}) or 0) > (stamp(game.get('context') or {}) or 0):
            merged['context'] = recent['context']
        evidence = {(m.get('ticker'), m.get('quoteSide')): m.get('espnEvidence')
                    for m in recent.get('markets', []) if m.get('espnEvidence')}
        merged['markets'] = [{**m, **({'espnEvidence': evidence[(m.get('ticker'), m.get('quoteSide'))]}
                            if (m.get('ticker'), m.get('quoteSide')) in evidence else {})}
                            for m in game['markets'] if not m.get('referenceOnly')]
        merged['markets'] += [m for m in recent.get('markets', []) if m.get('referenceOnly')]
        games.append(merged)
    for game in references.values():
        refs = [m for m in game.get('markets', []) if m.get('referenceOnly')]
        if refs:
            games.append({**game, 'markets': refs})
    result = {**base, 'games': games}
    for key in ('primary_updated_at', 'raw_market_count', 'series_counts', 'market_coverage',
                'filters', 'prop_verification', 'prop_context', 'td_context'):
        if key in native:
            result[key] = native[key]
    return reconcile_evidence(result, other)

def run(args, timeout=240):
    return subprocess.run(args, check=True, timeout=timeout)

def carry_nfl_evidence(candidate, previous):
    games={g.get('id'):g for g in previous.get('games',[])}
    for game in candidate.get('games',[]):
        old=games.get(game.get('id')) or {}
        if any(game.get(key)!=old.get(key) for key in ('home','away')) or stamp_time(game.get('commence_time'))!=stamp_time(old.get('commence_time')):continue
        if old.get('context'):game['context']=old['context']
        markets={(m.get('ticker'),m.get('quoteSide'),m.get('player')):m for m in old.get('markets',[])}
        for market in game.get('markets',[]):
            prior=markets.get((market.get('ticker'),market.get('quoteSide'),market.get('player'))) or {}
            if market.get('team')!=prior.get('team'):continue
            for field in ('propHistory','propHistoryStatus','tdHistory','contextSignals','espnEvidence'):
                if field in prior:market[field]=prior[field]

def refresh(sport):
    saved = {name: Path(name).read_bytes() for name in FILES[sport] if Path(name).exists()}
    try:
        primary_error = None
        try:
            for step in STEPS[sport]:
                parts = step.split()
                run(['python', 'scripts/' + parts[0], *parts[1:]], timeout=600 if sport == 'nba' else 180)
        except Exception as error:
            primary_error = error
            print('Primary source unavailable; trying public references:', sport, error, flush=True)
            for name in FILES[sport]:
                if name in saved:
                    Path(name).write_bytes(saved[name])
                else:
                    Path(name).unlink(missing_ok=True)
        # Carry dated evidence before gap filling. New native snapshots have no
        # context yet; the public collector must not launch an unbounded rebuild.
        previous = json.loads(saved[FILES[sport][0]]) if FILES[sport][0] in saved else {}
        if sport == 'nfl' and primary_error is None:
            target=Path(FILES[sport][0]);current=json.loads(target.read_text())
            carry_nfl_evidence(current,previous)
            target.write_text(json.dumps(current,separators=(',',':'))+'\n')
        checkpoint = {name: Path(name).read_bytes() for name in FILES[sport] if Path(name).exists()}
        try:
            args=['python', 'scripts/update_public_odds.py', '--sport', sport]
            if sport == 'nfl': args.append('--skip-nfl-context')
            run(args, timeout=90)
        except Exception as error:
            for name, raw in checkpoint.items(): Path(name).write_bytes(raw)
            print('Public references delayed; fresh native prices retained:',sport,error,flush=True)
        # Isolate the free exchange backup from primary and ESPN failures.
        try:
            run(['python', 'scripts/update_polymarket.py', '--sport', sport], timeout=90)
        except Exception as error:
            print('Polymarket backup delayed; other sources retained:', sport, error, flush=True)
        if sport == 'nfl' and primary_error is None:
            target=Path(FILES[sport][0])
            # A context outage must not roll newly collected, roster-verified
            # prices back. Prior evidence keeps its own original timestamps.
            for step in ('enrich_snapshot_context.py','update_nfl_td_context.py'):
                before=target.read_bytes()
                try:run(['python','scripts/'+step],timeout=90)
                except Exception as error:
                    target.write_bytes(before)
                    print('NFL context delayed; fresh prices retained:',step,error,flush=True)
        if previous.get('espn_evidence'):
            target = Path(FILES[sport][0]);current = json.loads(target.read_text())
            current.setdefault('espn_evidence', previous['espn_evidence'])
            target.write_text(json.dumps(current, separators=(',', ':'))+'\n')
        try:
            run(['python', 'scripts/update_espn_evidence.py', '--sport', sport], timeout=180)
        except Exception as error:
            print('ESPN evidence check delayed; earlier dated evidence retained:', sport, error, flush=True)
        if sport == 'ncaaf':
            try:
                run(['python', 'scripts/update_ncaaf_context.py', '--no-weather'], timeout=180)
            except Exception as error:
                print('NCAAF context delayed; retain prior independent context:', error, flush=True)
                if 'data/ncaaf-context.json' in saved:
                    Path('data/ncaaf-context.json').write_bytes(saved['data/ncaaf-context.json'])
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
                candidate = reconcile_snapshot(candidate, existing)
                raw = json.dumps(candidate).encode()
                if candidate == existing:
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
    if sports in (('nhl',), ('nfl',)):
        # Dedicated NFL/NHL quote publication must not wait for recommendation capture.
        if publish_changes:
            publish(names, results)
            if sports == ('nfl',) and results.get('nfl'):
                try:
                    run(['python', 'scripts/refresh_forecast_worker.py', '--capture-only'], timeout=240)
                except Exception as error:
                    print('::error title=NFL forecast capture::' + str(error), flush=True)
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
