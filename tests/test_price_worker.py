import unittest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
from scripts.refresh_price_worker import valid_snapshot
from scripts import refresh_price_worker as worker
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from scripts.preserve_newer_snapshot import replace_if_newer

class RefreshSafeguards(unittest.TestCase):
    def test_expired_prices_cannot_be_relabelled(self):
        with self.assertRaises(ValueError):
            valid_snapshot({'updated_at': '2026-10-06T00:00:00Z', 'games': []},
                           'nfl', now=1791266400)

    def test_empty_outage_keeps_upcoming_feed(self):
        with self.assertRaises(ValueError):
            valid_snapshot({'updated_at': '2026-10-06T06:00:00Z', 'markets': []}, 'mlb',
                           {'markets': [{'game_time': '2026-10-07T06:00:00Z'}]}, 1791266400)

    def test_offseason_empty_feed_is_allowed(self):
        valid_snapshot({'updated_at': '2026-10-06T06:00:00Z', 'markets': []}, 'nhl',
                       {'markets': []}, 1791266400)

    def test_nonempty_fresh_feed_is_allowed(self):
        valid_snapshot({'updated_at': '2026-10-06T06:00:00Z', 'games': [{'markets': []}]},
                       'nfl', now=1791266400)

    def test_failure_restores_prices_and_context(self):
        with tempfile.TemporaryDirectory() as folder:
            before = os.getcwd()
            try:
                os.chdir(folder)
                Path('data').mkdir()
                for name in worker.FILES['mlb']:
                    Path(name).write_text('{"original": true}')
                def failure(*args, **kwargs):
                    Path(worker.FILES['mlb'][0]).write_text('{"partial": true}')
                    raise RuntimeError('upstream unavailable')
                with patch.object(worker, 'run', side_effect=failure):
                    self.assertFalse(worker.refresh('mlb'))
                for name in worker.FILES['mlb']:
                    self.assertEqual(json.loads(Path(name).read_text()), {'original': True})
            finally:
                os.chdir(before)

    def test_slow_job_cannot_overwrite_newer_feed(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / 'candidate.json', Path(folder) / 'current.json'
            source.write_text('{"updated_at":"2026-10-06T05:00:00Z"}')
            target.write_text('{"updated_at":"2026-10-06T06:00:00Z"}')
            self.assertFalse(replace_if_newer(source, target))
            self.assertEqual(json.loads(target.read_text())['updated_at'], '2026-10-06T06:00:00Z')

class UfcEvidencePublication(unittest.TestCase):
    def test_old_collector_can_refresh_quotes_without_downgrading_profiles(self):
        now = worker.time.time()
        at = worker.datetime.fromtimestamp(now - 3600, worker.timezone.utc).isoformat()
        prior = {'fighter_stats': {'A': {'identity_verified': True, 'profile_version': 2, 'fetched_at': at, 'str_def': 65},
                                  'B': {'identity_verified': True, 'profile_version': 2, 'fetched_at': at, 'td_def': 80}}}
        candidate = {'updated_at': worker.datetime.fromtimestamp(now, worker.timezone.utc).isoformat(),
                     'markets': [{'fighter1': 'A', 'fighter2': 'B', 'yes_ask': .6}],
                     'fighter_stats': {'A': {'identity_verified': True, 'fetched_at': at, 'slpm': 4}}}
        merged = worker.reconcile_evidence(candidate, prior, now)
        self.assertEqual(merged['fighter_stats'], prior['fighter_stats'])
        self.assertEqual(merged['markets'], candidate['markets'])
        self.assertEqual(merged['updated_at'], candidate['updated_at'])
        self.assertEqual(merged['fighter_stats']['A']['fetched_at'], at)
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder)/'candidate.json', Path(folder)/'current.json'
            source.write_text(json.dumps(candidate))
            target.write_text(json.dumps({**prior, 'updated_at': at}))
            self.assertTrue(replace_if_newer(source, target))
            self.assertEqual(json.loads(target.read_text())['fighter_stats'], prior['fighter_stats'])

    def test_expired_or_wrong_identity_profiles_are_not_reintroduced(self):
        now = worker.time.time()
        expired = worker.datetime.fromtimestamp(now - 49*3600, worker.timezone.utc).isoformat()
        prior = {'fighter_stats': {'A': {'identity_verified': True, 'profile_version': 2, 'fetched_at': expired},
                                  'B': {'identity_verified': False, 'profile_version': 2}}}
        candidate = {'markets': [{'fighter1': 'A', 'fighter2': 'B'}], 'fighter_stats': {}}
        self.assertEqual(worker.reconcile_evidence(candidate, prior, now)['fighter_stats'], {})

if __name__ == '__main__':
    unittest.main()
