"""Settle recorded Kalshi selections against the contract's own final result."""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / 'data/pick-history.json'
API = 'https://external-api.kalshi.com/trade-api/v2/markets/'


def fetch_market(ticker):
    request = urllib.request.Request(API + urllib.parse.quote(ticker, safe=''),
                                     headers={'User-Agent': 'sports-dashboard/1.0'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response).get('market', {})


def settle_records(records, fetch=fetch_market, now=None, limit=60):
    now = now or datetime.now(timezone.utc)
    cache = {}
    changed = 0
    for row in records:
        if row.get('result') or not row.get('ticker'):
            continue
        try:
            close = datetime.fromisoformat((row.get('eventTime') or row['closeTime']).replace('Z', '+00:00'))
        except (KeyError, ValueError, TypeError):
            continue
        if close > now or len(cache) >= limit and row['ticker'] not in cache:
            continue
        if row['ticker'] not in cache:
            try:
                cache[row['ticker']] = fetch(row['ticker'])
            except Exception as error:
                print('Settlement lookup deferred:', row['ticker'], error, file=sys.stderr)
                cache[row['ticker']] = {}
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
    changed = settle_records(payload.get('records', []))
    if changed:
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        FILE.write_text(json.dumps(payload, indent=2) + '\n')
    print('Settled', changed, 'picks')


if __name__ == '__main__':
    main()
