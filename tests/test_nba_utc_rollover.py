import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from scripts import update_kalshi_nba as nba


class NBAUTCRolloverTests(unittest.TestCase):
    def test_schedule_window_keeps_local_day_and_existing_forward_horizon(self):
        for stamp, first, last in [
            ('2026-10-21T23:30:00+00:00', '20261021', '20261028'),
            ('2026-10-22T00:23:00+00:00', '20261021', '20261029'),
            ('2026-10-22T06:30:00+00:00', '20261021', '20261029'),
            ('2026-10-22T07:00:00+00:00', '20261022', '20261029'),
            ('2027-01-01T00:30:00+00:00', '20261231', '20270108'),
            ('2026-11-02T07:30:00+00:00', '20261101', '20261109'),
        ]:
            with self.subTest(stamp=stamp):
                days = nba.schedule_dates(datetime.fromisoformat(stamp))
                self.assertEqual((days[0], days[-1]), (first, last))
                self.assertEqual(len(days), len(set(days)))

    def test_refresh_publishes_tonights_quotes_and_context_after_utc_midnight(self):
        now = datetime(2026, 10, 22, 0, 23, tzinfo=timezone.utc)
        event = {
            'id': '401909092', 'date': '2026-10-22T02:00:00Z',
            'season': {'type': 2}, 'status': {'type': {'state': 'pre'}},
            'competitions': [{'competitors': [
                {'homeAway': 'away', 'team': {'id': '9', 'abbreviation': 'GS', 'shortDisplayName': 'Warriors'}},
                {'homeAway': 'home', 'team': {'id': '13', 'abbreviation': 'LAL', 'shortDisplayName': 'Lakers'}},
            ]}],
        }
        market = {
            'status': 'active', 'ticker': 'KXNBAGAME-26OCT212200GSLAL-LAL',
            'event_ticker': 'KXNBAGAME-26OCT212200GSLAL',
            'yes_ask': 70, 'yes_bid': 68, 'volume': 200,
        }
        requested = []

        def get(url):
            requested.append(url)
            if '/scoreboard?' in url:
                return {'events': [event] if 'dates=20261021&' in url else []}
            if '/markets?' in url:
                return {'markets': [market]}
            return {}

        previous = Path.cwd()
        try:
            with tempfile.TemporaryDirectory() as directory:
                os.chdir(directory)
                Path('data').mkdir()
                # Reproduce the fresh but incomplete context from the broken refresh.
                Path('data/nba-context.json').write_text(json.dumps({
                    'schemaVersion': 1, 'updated_at': now.isoformat(), 'games': {},
                }))
                with patch.object(nba, 'get', side_effect=get), \
                     patch.object(nba, 'datetime', wraps=datetime) as clock, \
                     patch.dict(nba.SERIES, {'KXNBAGAME': 'moneyline'}, clear=True):
                    clock.now.return_value = now
                    nba.main()
                context = json.loads(Path('data/nba-context.json').read_text())
                snapshot = json.loads(Path('data/kalshi-nba.json').read_text())
                self.assertEqual(len(snapshot['markets']), 1)
                row = snapshot['markets'][0]
                self.assertIn(row['game_id'], context['games'])
                self.assertEqual(context['games'][row['game_id']]['away'], 'GSW')
                self.assertEqual(row['game_time'], context['games'][row['game_id']]['start'])
                self.assertTrue(any('dates=20261021&' in url for url in requested))
        finally:
            os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
