import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from settle_pick_history import settle_records


class SettlementTests(unittest.TestCase):
    def test_final_result_and_side(self):
        rows = [dict(ticker='A', side=side, eventTime='2026-09-25T10:00:00Z', result=None)
                for side in ('yes', 'no')]
        count = settle_records(rows, lambda _: {'status': 'settled', 'result': 'yes'},
                               datetime(2026, 9, 26, tzinfo=timezone.utc))
        self.assertEqual(count, 2)
        self.assertEqual([row['result'] for row in rows], ['win', 'loss'])

    def test_no_premature_result_and_void(self):
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        rows = [dict(ticker='FUTURE', eventTime='2026-09-27T10:00:00Z', result=None),
                dict(ticker='OPEN', eventTime='2026-09-25T10:00:00Z', result=None),
                dict(ticker='VOID', eventTime='2026-09-25T10:00:00Z', result=None)]
        seen = []
        def fetch(ticker):
            seen.append(ticker)
            return {'status': 'open', 'result': 'yes'} if ticker == 'OPEN' else {'status': 'canceled'}
        self.assertEqual(settle_records(rows, fetch, now), 1)
        self.assertEqual(seen, ['OPEN', 'VOID'])
        self.assertEqual([row['result'] for row in rows], [None, None, 'void'])


if __name__ == '__main__':
    unittest.main()
