import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import update_kalshi_nhl as nhl
from scripts import refresh_price_worker as worker


class NHLRefresh(unittest.TestCase):
    def test_backup_quote_endpoint_and_schedule_retry(self):
        for url in (nhl.API+'/markets?cursor=next', 'https://site.api.espn.com/scoreboard'):
            with patch.object(nhl, 'get', side_effect=[OSError('outage'), {'markets': []}]) as get:
                self.assertEqual(nhl.fetch_json(url), {'markets': []})
                expected = url.replace(nhl.API, nhl.BACKUP_API) if url.startswith(nhl.API) else url
                self.assertEqual(get.call_args_list[1].args[0], expected)
        with patch.object(nhl, 'get', side_effect=OSError('offline')):
            with self.assertRaises(RuntimeError):
                nhl.fetch_json(nhl.API+'/markets')

    def test_nhl_cycle_publishes_without_other_sports_or_capture(self):
        with patch.object(worker, 'refresh', return_value=True) as refresh, patch.object(worker, 'publish') as publish, patch.object(worker, 'run') as run:
            self.assertEqual(worker.cycle(sports=('nhl',)), {'nhl': True})
            refresh.assert_called_once_with('nhl')
            publish.assert_called_once_with(worker.FILES['nhl'], {'nhl': True})
            run.assert_not_called()

    def test_health_reads_newer_reconciled_feed_and_retains_other_worker_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            before = os.getcwd()
            try:
                os.chdir(folder)
                Path('data').mkdir()
                at = worker.datetime.now(worker.timezone.utc).isoformat()
                Path('data/dashboard-health.json').write_text(json.dumps({'refreshResults': {'mlb': {'ok': False, 'at': at}}}))
                Path('data/kalshi-nhl.json').write_text(json.dumps({'updated_at': at, 'markets': []}))
                seen = []
                def check(*args, **kwargs):
                    seen.append(os.environ['REFRESH_STATUS'])
                    snapshot = json.loads(Path('data/kalshi-nhl.json').read_text())
                    Path('data/dashboard-health.json').write_text(json.dumps({'sports': {'nhl': {'snapshotAt': snapshot['updated_at']}}}))
                with patch.object(worker, 'run', side_effect=check):
                    worker.refresh_health({'nhl': True})
                report = json.loads(Path('data/dashboard-health.json').read_text())
                self.assertEqual(report['sports']['nhl']['snapshotAt'], at)
                self.assertEqual(seen, ['failure'])
                self.assertTrue(report['refreshResults']['nhl']['ok'])
                self.assertFalse(report['refreshResults']['mlb']['ok'])
            finally:
                os.chdir(before)

    def test_publication_diagnoses_remote_snapshot_instead_of_older_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            before = os.getcwd()
            try:
                os.chdir(folder)
                Path('data').mkdir()
                name = 'data/kalshi-nhl.json'
                Path(name).write_text('{"updated_at":"2026-10-06T17:00:00Z","markets":[]}')
                seen = []
                def command(args, **kwargs):
                    if args[:3] == ['git', 'reset', '--hard']:
                        Path(name).write_text('{"updated_at":"2026-10-06T18:00:00Z","markets":[]}')
                def health(results):
                    seen.append(json.loads(Path(name).read_text())['updated_at'])
                    Path('data/dashboard-health.json').write_text('{}')
                with patch.object(worker, 'run', side_effect=command), patch.object(worker, 'refresh_health', side_effect=health), patch.object(worker.subprocess, 'run') as process:
                    process.return_value.returncode = 0
                    worker.publish([name], {'nhl': True})
                self.assertEqual(seen, ['2026-10-06T18:00:00Z'])
            finally:
                os.chdir(before)


if __name__ == '__main__':
    unittest.main()
