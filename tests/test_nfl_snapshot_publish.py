import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from preserve_newer_nfl import replace_if_newer

class PublicationTests(unittest.TestCase):
    def test_older_worker_cannot_overwrite_newer_prices(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'source.json', Path(directory) / 'target.json'
            now = datetime.now(timezone.utc)
            source.write_text(json.dumps({'updated_at': (now-timedelta(minutes=5)).isoformat(), 'games': []}))
            target.write_text(json.dumps({'updated_at': now.isoformat(), 'games': []}))
            before = target.read_text()
            self.assertFalse(replace_if_newer(source, target))
            self.assertEqual(target.read_text(), before)
            source.write_text(json.dumps({'updated_at': (now+timedelta(seconds=1)).isoformat(), 'games': []}))
            self.assertTrue(replace_if_newer(source, target))
    def test_invalid_payload_never_replaces_prices(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'source.json', Path(directory) / 'target.json'
            source.write_text(json.dumps({'updated_at':'invalid','games':[]}))
            target.write_text('unchanged')
            with self.assertRaises(ValueError):replace_if_newer(source, target)
            self.assertEqual(target.read_text(), 'unchanged')
if __name__=='__main__':unittest.main()
