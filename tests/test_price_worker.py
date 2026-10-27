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
    def test_fresh_reference_metadata_cannot_pass_expired_native_prices(self):
        payload={'updated_at':'2026-10-06T06:00:00Z', 'primary_updated_at':'2026-10-06T05:00:00Z','games':[{'markets':[]}]}
        with self.assertRaisesRegex(ValueError,'native prices are delayed'):
            valid_snapshot(payload,'nfl',now=1791266400)
        payload['primary_updated_at']='2026-10-06T05:50:00Z'
        valid_snapshot(payload,'nfl',now=1791266400)
    def test_optional_nfl_enrichment_outage_keeps_new_verified_quotes(self):
        with tempfile.TemporaryDirectory() as folder:
            before=os.getcwd()
            try:
                os.chdir(folder);Path('data').mkdir()
                at=worker.datetime.now(worker.timezone.utc).isoformat()
                prior={'updated_at':at,'games':[{'id':'g','home':'H','away':'A','commence_time':'2099-01-01T00:00:00Z','context':{'updated_at':'2026-01-01T00:00:00Z'},'markets':[]}]}
                Path('data/kalshi-nfl.json').write_text(json.dumps(prior))
                def step(args,**kwargs):
                    if 'scripts/update_kalshi.py' in args:
                        fresh={**prior,'games':[{k:v for k,v in prior['games'][0].items() if k!='context'}]}
                        fresh['games'][0]['markets']=[{'ticker':'new','price':150,'quotedAt':at,'_rosterVerified':True}]
                        Path('data/kalshi-nfl.json').write_text(json.dumps(fresh))
                    if any('enrich_snapshot_context' in a or 'update_nfl_td_context' in a for a in args):raise RuntimeError('context unavailable')
                with patch.object(worker,'run',side_effect=step):self.assertTrue(worker.refresh('nfl'))
                result=json.loads(Path('data/kalshi-nfl.json').read_text())
                self.assertEqual(result['games'][0]['markets'][0]['price'],150)
                self.assertEqual(result['games'][0]['context']['updated_at'],'2026-01-01T00:00:00Z')
            finally:os.chdir(before)
    def test_public_reference_timeout_preserves_fresh_native_quotes(self):
        with tempfile.TemporaryDirectory() as folder:
            before=os.getcwd()
            try:
                os.chdir(folder);Path('data').mkdir()
                at=worker.datetime.now(worker.timezone.utc).isoformat()
                path=Path('data/kalshi-nfl.json')
                old={'updated_at':at,'games':[{'id':'g','markets':[{'ticker':'old'}]}]}
                fresh={'updated_at':at,'games':[{'id':'g','markets':[{'ticker':'new','price':150,'_rosterVerified':True}]}]}
                path.write_text(json.dumps(old))
                def step(args,**kwargs):
                    if 'scripts/update_kalshi.py' in args:path.write_text(json.dumps(fresh))
                    if 'scripts/update_public_odds.py' in args:
                        self.assertIn('--skip-nfl-context',args)
                        path.write_text('{"partial":true}')
                        raise TimeoutError('public source delayed')
                with patch.object(worker,'run',side_effect=step):self.assertTrue(worker.refresh('nfl'))
                self.assertEqual(json.loads(path.read_text()),fresh)
            finally:os.chdir(before)

    def test_dedicated_nfl_publication_does_not_wait_for_recommendation_capture(self):
        with patch.object(worker,'refresh',return_value=True), patch.object(worker,'publish') as publish, patch.object(worker,'run') as run:
            self.assertEqual(worker.cycle(sports=('nfl',)),{'nfl':True})
        run.assert_called_once_with(['python','scripts/refresh_forecast_worker.py','--capture-only'],timeout=240)
        publish.assert_called_once()

    def test_nfl_context_reuse_never_refreshes_evidence_dates_or_copies_prices(self):
        old={'games':[{'id':'g','home':'H','away':'A','commence_time':'2026-10-23T00:15:00Z','context':{'updated_at':'old'},'markets':[{'ticker':'x','team':'H','player':'P','quoteSide':'yes','price':100,'propHistory':{'as_of':'old'}}]}]}
        fresh={'games':[{'id':'g','home':'H','away':'A','commence_time':'2026-10-23T00:15:00+00:00','markets':[{'ticker':'x','team':'H','player':'P','quoteSide':'yes','price':150}]}]}
        worker.carry_nfl_evidence(fresh,old)
        self.assertEqual(fresh['games'][0]['context']['updated_at'],'old')
        self.assertEqual(fresh['games'][0]['markets'][0]['price'],150)
        self.assertEqual(fresh['games'][0]['markets'][0]['propHistory']['as_of'],'old')
        different={'games':[{'id':'g','home':'Other','away':'A','commence_time':'2026-10-23T00:15:00Z','markets':[]}]}
        worker.carry_nfl_evidence(different,old);self.assertNotIn('context',different['games'][0])
    def test_metadata_refresh_does_not_roll_native_prices_back(self):
        def snapshot(wrapper, primary, price, reference):
            return {'updated_at': wrapper, 'primary_updated_at': primary, 'games': [
                {'id': 'game', 'markets': [{'ticker': 'contract', 'quoteSide': 'yes',
                 'price': price, 'quotedAt': primary}, {'referenceOnly': True, 'price': reference,
                 'quotedAt': wrapper}]}]}
        fresh = snapshot('2026-10-22T02:45:13Z', '2026-10-22T02:44:40Z', 130, 125)
        slow = snapshot('2026-10-22T02:55:13Z', '2026-10-22T02:35:11Z', 144, 127)
        merged = worker.reconcile_snapshot(slow, fresh)
        self.assertEqual(merged['updated_at'], slow['updated_at'])
        self.assertEqual(merged['primary_updated_at'], fresh['primary_updated_at'])
        self.assertEqual(merged['games'][0]['markets'], [fresh['games'][0]['markets'][0], slow['games'][0]['markets'][1]])
        self.assertEqual(worker.reconcile_snapshot(fresh, slow), merged)

    def test_new_native_capture_does_not_resurrect_removed_contracts(self):
        old = {'updated_at': '2026-10-22T02:55:00Z', 'primary_updated_at': '2026-10-22T02:35:00Z',
               'games': [{'id': 'game', 'markets': [{'ticker': 'suspended'}]}]}
        new = {'updated_at': '2026-10-22T02:54:00Z', 'primary_updated_at': '2026-10-22T02:54:00Z',
               'games': [{'id': 'game', 'markets': []}]}
        self.assertEqual(worker.reconcile_snapshot(new, old)['games'][0]['markets'], [])

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
