import unittest
from datetime import datetime, timezone
from scripts.update_kalshi_nba import threshold, normalize_market, event_match, box_record

class NBAMarkets(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
        self.event = {'id': 'g', 'date': '2026-10-26T00:00:00Z', 'season': {'type': 2}, 'status': {'type': {'state': 'pre'}}, 'competitions': [{'competitors': [{'homeAway': 'away', 'team': {'id': '2', 'abbreviation': 'BOS', 'shortDisplayName': 'Celtics'}}, {'homeAway': 'home', 'team': {'id': '18', 'abbreviation': 'NY', 'shortDisplayName': 'Knicks'}}]}]}
        self.market = {'status': 'active', 'ticker': 'KXNBASPREAD-26OCT25BOSNY-BOS4', 'event_ticker': 'KXNBASPREAD-26OCT25BOSNY', 'title': 'Boston wins by over 4 points', 'yes_ask': 60, 'yes_bid': 57, 'no_ask': 43, 'no_bid': 40, 'volume': 200}
    def test_threshold_semantics(self):
        for text, value in [('over 4 points', 4.5), ('20+ points', 19.5), ('at least 20 points', 19.5), ('over 20.5 points', 20.5)]:
            self.assertEqual(threshold({'title': text}), value)
        self.assertIsNone(threshold({'title': '20.2+ points'}))
    def test_schedule_and_side_mapping(self):
        rows = normalize_market(self.market, 'KXNBASPREAD', [self.event], {}, self.now)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['label'], 'Celtics -4.5 Spread')
        self.assertEqual(rows[1]['label'], 'Knicks +4.5 Spread')
        self.assertEqual(rows[1]['quoteSide'], 'no')
        self.assertEqual(rows[1]['yes_ask'], .43)
    def test_unmatched_ambiguous_and_started_events_are_excluded(self):
        self.assertIsNone(event_match(self.market, [self.event, self.event]))
        self.event['status']['type']['state'] = 'in'
        self.assertEqual(normalize_market(self.market, 'KXNBASPREAD', [self.event], {}, self.now), [])
    def test_roster_verified_prop_mapping(self):
        m = {**self.market, 'ticker': 'KXNBAPTS-26OCT25BOSNY-PLAYER20', 'event_ticker': 'KXNBAPTS-26OCT25BOSNY', 'title': 'Test Player: 20+ points'}
        ctx = {'players': {'p': {'id': 'p', 'name': 'Test Player', 'team': 'BOS'}}}
        rows = normalize_market(m, 'KXNBAPTS', [self.event], ctx, self.now)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['line'], 19.5)
        self.assertTrue(rows[0]['player_verified'])
        self.assertEqual(normalize_market(m, 'KXNBAPTS', [self.event], {}, self.now), [])
    def test_missing_crossed_and_zero_quotes_are_rejected(self):
        self.assertEqual(normalize_market({**self.market, 'yes_bid': 90, 'no_bid': 90}, 'KXNBASPREAD', [self.event], {}, self.now), [])
    def test_preseason_or_uncompleted_history_is_rejected(self):
        e = {**self.event, 'date': '2026-10-24T00:00:00Z', 'season': {'type': 1}, 'status': {'type': {'completed': True}}}
        self.assertEqual(box_record(e, {}, self.now), ([], []))

if __name__ == '__main__':
    unittest.main()
