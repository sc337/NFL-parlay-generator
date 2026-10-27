"""Capture and settle forecasts independently of slow market/context collectors.

Run in a disposable checkout. Immutable entry forecasts survive publication races.
Unavailable outcomes stay pending; no historical forecast backfill is performed.
"""
import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
try:
    from scripts.refresh_price_worker import run
    from scripts.settle_pick_history import settle_records
    from scripts.settle_espn_reference import settle_references
    from scripts.settle_forecast_audit import add_nfl_totals
except ModuleNotFoundError:
    from refresh_price_worker import run
    from settle_pick_history import settle_records
    from settle_espn_reference import settle_references
    from settle_forecast_audit import add_nfl_totals

ARCHIVES = ('data/forecast-audit.json', 'data/pick-history.json')

def merge_records(existing, incoming):
    records = {r['id']: r for r in existing}
    for row in incoming:
        old = records.get(row['id'])
        if old is None:
            records[row['id']] = row
            continue
        # Keep the original prospective forecast. Only later evidence/outcomes
        # may be added; new prices and model updates cannot rewrite an entry.
        first = min((old, row), key=lambda r: r.get('recordedAt') or r.get('capturedAt') or '')
        merged = {**first}
        for key in ('settlementAttemptAt', 'settlementRetryAt', 'settlementAttempts',
                    'closingAsk', 'closingQuoteAt', 'closingQuoteSource', 'actualTotal',
                    'scoreAttemptAt', 'scoreRetryAt'):
            later = max((old,row), key=lambda r: r.get('settlementAttemptAt') or r.get('closingQuoteAt') or '')
            if key in later:merged[key] = later[key]
        settled = old if old.get('result') else row
        if settled.get('result'):
            for key in ('result','settledAt','settlementSource'):
                if key in settled:merged[key] = settled[key]
        records[row['id']] = merged
    return list(records.values())

def reconcile(source, target):
    incoming = json.loads(Path(source).read_text())
    current = json.loads(Path(target).read_text()) if Path(target).exists() else {'records':[]}
    merged = {**incoming,'records':merge_records(current['records'],incoming['records']),
              'updated_at':datetime.now(timezone.utc).isoformat()}
    Path(target).write_text(json.dumps(merged, separators=(',',':'))+'\n')

def cycle(publish=True):
    # Capture first so slow/outage settlement cannot erase today's evidence.
    run(['node','scripts/update_forecast_audit.js'], timeout=180)
    run(['node','scripts/update_pick_history.js'], timeout=180)
    payloads = {name:json.loads(Path(name).read_text()) for name in ARCHIVES}
    # Publish the capture checkpoint before any upstream outcome requests.
    # A settlement outage/timeout cannot hold current prospective records back.
    if publish:publish_records({name:Path(name).read_text() for name in ARCHIVES})
    rows = [r for payload in payloads.values() for r in payload['records']]
    changed = settle_records(rows,limit=240,workers=8) + settle_references(rows,limit=60,workers=6)
    changed += add_nfl_totals(payloads['data/forecast-audit.json']['records'],limit=100)
    for name,payload in payloads.items():
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        Path(name).write_text(json.dumps(payload,separators=(',',':'))+'\n')
    print('Verified outcomes added:',changed,flush=True)
    saved = {name:Path(name).read_text() for name in ARCHIVES}
    if publish:publish_records(saved)
    else:run(['node','scripts/build_forecast_report.js'],timeout=90)

def capture_near_nfl():
    """Publish fresh NFL checkpoints and verified final totals after a price refresh."""
    name='data/forecast-audit.json'
    before=Path(name).read_bytes()
    run(['node','scripts/update_forecast_audit.js','--sport=nfl','--near-only'],timeout=180)
    captured=Path(name).read_bytes()
    payload=json.loads(captured)
    add_nfl_totals(payload['records'],limit=30)
    candidate=(json.dumps(payload,separators=(',',':'))+'\n').encode()
    if candidate != captured:Path(name).write_bytes(candidate)
    after=Path(name).read_bytes()
    if after != before:
        run(['git','config','user.name','github-actions[bot]'])
        run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'])
        publish_records({name:after.decode()})

def publish_records(saved):
    for attempt in range(3):
        run(['git','fetch','origin','main'])
        run(['git','reset','--hard','origin/main'])
        for name,raw in saved.items():
            temp = Path('/tmp') / (Path(name).name+'.forecast-candidate')
            temp.write_text(raw)
            reconcile(temp,name)
        run(['node','scripts/build_forecast_report.js'],timeout=90)
        run(['git','add','--',*ARCHIVES,'data/forecast-report.json'])
        if subprocess.run(['git','diff','--cached','--quiet']).returncode == 0:return
        run(['git','commit','-m','Record and settle prospective forecasts independently'])
        if subprocess.run(['git','push','origin','HEAD:main']).returncode == 0:return
    raise RuntimeError('Forecast publication conflicted three times')

if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--no-publish',action='store_true');parser.add_argument('--reconcile',nargs=2)
    parser.add_argument('--capture-only',action='store_true')
    args = parser.parse_args()
    if args.reconcile:reconcile(*args.reconcile)
    elif args.capture_only:capture_near_nfl()
    else:cycle(not args.no_publish)
