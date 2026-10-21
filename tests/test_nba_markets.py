import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from scripts.update_kalshi_nba import threshold, normalize_market, event_match, box_record, discover_prop_series, SERIES

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
    def test_double_and_triple_double_yes_no_markets(self):
        ctx = {'players': {'p': {'id': 'p', 'name': 'Test Player', 'team': 'BOS'}}}
        for series, kind, name in [('KXNBA2D', 'double_double', 'Double Double'), ('KXNBA3D', 'triple_double', 'Triple Double')]:
            m = {**self.market, 'ticker': series+'-26OCT25BOSNY-TESTPLAYER1', 'event_ticker': series+'-26OCT25BOSNY', 'title': 'Test Player: '+name, 'yes_sub_title': 'Test Player', 'strike_type': 'greater', 'floor_strike': 0.5}
            rows = normalize_market(m, series, [self.event], ctx, self.now)
            self.assertEqual([r['kind'] for r in rows], [kind, kind])
            self.assertEqual([r['side'] for r in rows], ['yes', 'no'])
            self.assertTrue(all(r['line'] is None and r['player_verified'] for r in rows))
            self.assertEqual(rows[0]['label'], 'Test Player '+name+' (Yes)')
            self.assertEqual(rows[1]['label'], 'Test Player '+name+' (No)')
    def test_missing_crossed_and_zero_quotes_are_rejected(self):
        self.assertEqual(normalize_market({**self.market, 'yes_bid': 90, 'no_bid': 90}, 'KXNBASPREAD', [self.event], {}, self.now), [])
    def test_new_props_use_advertised_series_exact_thresholds_and_verified_rosters(self):
        ctx = {'players': {'p': {'id': 'p', 'name': 'Test Player', 'team': 'BOS'}}}
        for kind, title in [('pr', 'Points + Rebounds'), ('pa', 'Points + Assists'), ('ra', 'Rebounds + Assists'), ('steals', 'Steals'), ('blocks', 'Blocks')]:
            ticker = 'KXNBATEST'+kind.upper()
            found = discover_prop_series({'series': [{'ticker': ticker, 'title': 'NBA Player '+title}]})
            self.assertEqual(found, {ticker: kind})
            with patch.dict(SERIES, found):
                m = {**self.market, 'ticker': ticker+'-26OCT25BOSNY-PLAYER2', 'event_ticker': ticker+'-26OCT25BOSNY', 'title': 'Test Player: 2+ '+title}
                rows = normalize_market(m, ticker, [self.event], ctx, self.now)
                self.assertEqual([r['kind'] for r in rows], [kind, kind])
                self.assertEqual([r['side'] for r in rows], ['yes', 'no'])
                self.assertTrue(all(r['line'] == 1.5 and r['player_verified'] for r in rows))
                self.assertEqual(normalize_market(m, ticker, [self.event], {}, self.now), [])
    def test_series_discovery_does_not_invent_markets_or_confuse_periods_and_combined_defense(self):
        self.assertEqual(discover_prop_series({}), {})
        for ticker, title in [('KXNHLTEST', 'NBA Player Steals'), ('KXNBATEST', 'NBA Player Steals + Blocks'), ('KXNBATEST', 'NBA Team Blocks'), ('KXNBATEST', 'NBA First Quarter Points + Rebounds'), ('KXNBATEST', 'NBA Season Steals Leader'), ('KXNBATEST', 'NBA Player Points or Rebounds')]:
            self.assertEqual(discover_prop_series({'series': [{'ticker': ticker, 'title': title}]}), {})
    def test_preseason_or_uncompleted_history_is_rejected(self):
        e = {**self.event, 'date': '2026-10-24T00:00:00Z', 'season': {'type': 1}, 'status': {'type': {'completed': True}}}
        self.assertEqual(box_record(e, {}, self.now), ([], []))

if __name__ == '__main__':
    unittest.main()
