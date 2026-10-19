import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from scripts import settle_pick_history as settlement, update_kalshi as nfl

class Reliability(unittest.TestCase):
    def test_failed_front_of_queue_does_not_starve_later_results(self):
        rows=[{'ticker':str(i),'eventTime':'2026-10-01T00:00:00Z'} for i in range(3)]
        now=datetime(2026,10,19,tzinfo=timezone.utc)
        seen=[]
        def fetch(ticker):
            seen.append(ticker)
            return {'status':'settled','result':'yes'} if ticker=='2' else {}
        self.assertEqual(settlement.settle_records(rows,fetch,now,limit=2),0)
        self.assertEqual(settlement.settle_records(rows,fetch,now,limit=2),1)
        self.assertEqual(seen,['0','1','2'])
        self.assertEqual(rows[2]['result'],'win')
    def test_partial_family_failure_is_not_an_empty_success(self):
        with patch.object(nfl,'fetch_json',side_effect=OSError('offline')):
            with self.assertRaises(RuntimeError):nfl.fetch_series('KXNFLREC')
        with patch.object(nfl,'fetch_json',return_value={'markets':[]}):
            self.assertEqual(nfl.fetch_series('KXNFLREC'),[])
    def test_family_pagination_collects_all_pages(self):
        with patch.object(nfl,'fetch_json',side_effect=[{'markets':[1],'cursor':'next'},{'markets':[2]}]) as fetch:
            self.assertEqual(nfl.fetch_series('KXNFLREC'),[1,2])
            self.assertIn('cursor=next',fetch.call_args_list[1].args[0])
