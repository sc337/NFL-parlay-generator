import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts import settle_forecast_audit as audit


class ForecastAuditTests(unittest.TestCase):
    def test_final_score_requires_completed_game(self):
        completed = {'header': {'competitions': [{'status': {'type': {'completed': True}},
            'competitors': [{'score': {'value': 21}}, {'score': '24'}]}]}}
        with patch.object(audit, 'urlopen') as opener:
            opener.return_value.__enter__.return_value.read.return_value = b''
            with patch.object(audit.json, 'load', return_value=completed):
                self.assertEqual(audit.final_total('123'), 45)
            completed['header']['competitions'][0]['status']['type']['completed'] = False
            with patch.object(audit.json, 'load', return_value=completed):
                self.assertIsNone(audit.final_total('123'))

    def test_score_attaches_once_per_final_game(self):
        now = datetime(2026, 9, 28, 6, tzinfo=timezone.utc)
        rows = [{'sport': 'nfl', 'marketGroup': 'totals', 'eventId': '123',
                 'eventTime': '2026-09-28T00:00:00Z'} for _ in range(2)]
        calls = []
        def fetch(event):
            calls.append(event)
            return 45
        self.assertEqual(audit.add_nfl_totals(rows, fetch, now), 2)
        self.assertEqual(calls, ['123'])
        self.assertEqual(audit.add_nfl_totals(rows, fetch, now), 0)


if __name__ == '__main__':
    unittest.main()
