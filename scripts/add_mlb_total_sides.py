"""Upgrade an existing snapshot using its recorded opposite-side bids.

The timestamp and game context stay unchanged. The next collector refresh
fetches direct side quotes. This migration never complements an ask as an ask.
"""
import json
from pathlib import Path
from scripts.update_kalshi_mlb import normalize_market


def upgrade(snapshot):
    rows = snapshot.get('markets', [])
    existing = {(m.get('ticker'), m.get('side', 'yes')) for m in rows}
    additions = []
    for row in rows:
        if row.get('kind') != 'total' or row.get('side', 'yes') != 'yes':
            continue
        raw = {**row, 'yes_bid_dollars': row.get('yes_bid'),
               'yes_ask_dollars': row.get('yes_ask')}
        for selection in normalize_market(raw, row['series']):
            key = (selection.get('ticker'), selection['side'])
            if selection['side'] != 'no' or key in existing:
                continue
            additions.append({**row, **selection})
            existing.add(key)
    return {**snapshot, 'markets': rows + additions}


if __name__ == '__main__':
    path = Path('data/kalshi-mlb.json')
    snapshot = json.loads(path.read_text())
    path.write_text(json.dumps(upgrade(snapshot), indent=2) + '\n')
