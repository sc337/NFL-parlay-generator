"""Settle recorded Kalshi selections against the contract's own final result."""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

FILE = Path(__file__).resolve().parent.parent / 'data/pick-history.json'
API = 'https://external-api.kalshi.com/trade-api/v2/markets/'


def fetch_market(ticker):
    request = urllib.request.Request(API + urllib.parse.quote(ticker, safe=''),
                                     headers={'User-Agent': 'sports-dashboard/1.0'})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.load(response).get('market', {})


def settle_records(records, fetch=fetch_market, now=None, limit=60, workers=1):
    now = now or datetime.now(timezone.utc)
    cache = {}
    changed = 0
    # Deduplicate requests across sides, versions and both forecast archives.
    # Prioritize screened selections, then rotate through the older backlog.
    ordered = sorted(records, key=lambda r: (not bool((r.get('qualification') or {}).get('pass')), r.get('settlementAttemptAt') or ''))
    selected = {}
    for row in ordered:
        if row.get('result') or not row.get('ticker') or (row.get('settlement') or {}).get('provider') == 'ESPN':
            continue
        try:
            close = datetime.fromisoformat((row.get('eventTime') or row['closeTime']).replace('Z', '+00:00'))
            retry = datetime.fromisoformat(row['settlementRetryAt']) if row.get('settlementRetryAt') else None
        except (KeyError, ValueError, TypeError):
            continue
        if close <= now and (not retry or retry <= now) and len(selected) < limit:
            selected[row['ticker']] = True
    def load(ticker):
        try:
            return ticker, fetch(ticker)
        except Exception as error:
            print('Settlement lookup deferred:', ticker, error, file=sys.stderr)
            return ticker, {}
    with ThreadPoolExecutor(max_workers=max(1, min(8, workers))) as pool:
        cache.update(pool.map(load, selected))
    for row in sorted(records, key=lambda r: r.get("settlementAttemptAt") or ""):
        if row.get('result') or not row.get('ticker') or (row.get('settlement') or {}).get('provider') == 'ESPN':
            continue
        if row['ticker'] not in cache:
            continue
        try:
            close = datetime.fromisoformat((row.get('eventTime') or row['closeTime']).replace('Z', '+00:00'))
        except (KeyError, ValueError, TypeError):
            continue
        if close > now or len(cache) >= limit and row['ticker'] not in cache:
            continue
        if row['ticker'] not in cache:
            retry = row.get('settlementRetryAt')
            if retry:
                try:
                    if datetime.fromisoformat(retry) > now:
                        continue
                except ValueError:
                    pass
            try:
                cache[row['ticker']] = fetch(row['ticker'])
            except Exception as error:
                print('Settlement lookup deferred:', row['ticker'], error, file=sys.stderr)
                cache[row['ticker']] = {}
        row['settlementAttemptAt'] = now.isoformat()
        row['settlementAttempts'] = int(row.get('settlementAttempts') or 0) + 1
        row['settlementRetryAt'] = (now + timedelta(hours=min(24, 2 ** min(row['settlementAttempts'], 5)))).isoformat()
        market = cache[row['ticker']]
        status = str(market.get('status') or '').lower()
        result = str(market.get('result') or '').lower()
        if result == 'void' or status in ('canceled', 'cancelled'):
            row['result'] = 'void'
        elif status in ('settled', 'finalized') and result in ('yes', 'no'):
            row['result'] = 'win' if result == row.get('side', 'yes') else 'loss'
        else:
            continue
        row['settledAt'] = now.isoformat()
        row['settlementSource'] = 'Kalshi market result'
        changed += 1
    return changed


def main():
    if not FILE.exists():
        return
    payload = json.loads(FILE.read_text())
    try:
        from .settle_espn_reference import settle_references
    except ImportError:
        from settle_espn_reference import settle_references
    changed = settle_records(payload.get('records', [])) + settle_references(payload.get('records', []))
    if changed or any(r.get('settlementAttemptAt') for r in payload.get('records', [])):
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        FILE.write_text(json.dumps(payload, indent=2) + '\n')
    print('Settled', changed, 'picks')


if __name__ == '__main__':
    main()
