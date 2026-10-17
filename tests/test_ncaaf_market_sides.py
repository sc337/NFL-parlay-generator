import unittest
from scripts.update_kalshi_ncaaf import normalize_market, price, teams_by_event
from scripts.settle_pick_history import settle_records
from datetime import datetime, timezone


class CollegeSides(unittest.TestCase):
    def market(self, **patch):
        return {'ticker': 'KXNCAAFSPREAD-26OCT17AWYHOM-HOM3', 'event_ticker': 'KXNCAAFSPREAD-26OCT17AWYHOM',
                'title': 'Home wins by over 3.5 points', 'status': 'open',
                'yes_bid_dollars': '.58', 'yes_ask_dollars': '.62', 'volume_fp': '1000', **patch}

    def test_spread_no_is_other_team_plus_same_half_point_with_real_side_prices(self):
        yes, no = normalize_market(self.market(), 'KXNCAAFSPREAD', {'home': 'Home', 'away': 'Away'})
        self.assertEqual((yes['selection_team'], yes['point'], yes['label']), ('Home', -3.5, 'Home -3.5'))
        self.assertEqual((no['selection_team'], no['point'], no['label']), ('Away', 3.5, 'Away +3.5'))
        self.assertEqual(no['yes_ask'], .42)
        self.assertEqual(no['yes_bid'], .38)
        self.assertNotEqual(no['yes_ask'], 1-yes['yes_ask'])
        self.assertEqual(no['quoteSide'], 'no')
        self.assertEqual(yes['ticker'], no['ticker'])
        self.assertNotEqual(yes['selection_id'], no['selection_id'])
        self.assertEqual(no['contract_title'], yes['contract_title'])

    def test_missing_ambiguous_opponent_integer_threshold_and_invalid_prices_do_not_create_no(self):
        for names in (None, {'home': 'Home'}, {'home': 'Home', 'away': 'Away', 'other': 'Other'}, {'other': 'Other', 'away': 'Away'}):
            self.assertEqual(len(normalize_market(self.market(), 'KXNCAAFSPREAD', names)), 1)
        self.assertEqual(len(normalize_market(self.market(title='Home wins by over 3 points'), 'KXNCAAFSPREAD', {'home': 'Home', 'away': 'Away'})), 1)
        self.assertEqual(normalize_market(self.market(yes_bid_dollars=None), 'KXNCAAFSPREAD', {'home': 'Home', 'away': 'Away'}), [])
        self.assertEqual(normalize_market(self.market(no_ask_dollars='NaN'), 'KXNCAAFSPREAD', {'home': 'Home', 'away': 'Away'})[0]['quoteSide'], 'yes')
        self.assertIsNone(price(self.market(no_ask_dollars='NaN'), 'no', 'ask'))

    def test_totals_preserve_over_under_complement_in_both_directions(self):
        for title, opposite in [('Over 50.5 points scored', 'Under'), ('Under 50.5 points scored', 'Over')]:
            yes, no = normalize_market(self.market(title=title), 'KXNCAAFTOTAL')
            self.assertTrue(no['title'].startswith(opposite))
            self.assertEqual(no['yes_ask'], .42)
        self.assertEqual(len(normalize_market(self.market(title='Over 50 points scored'), 'KXNCAAFTOTAL')), 1)

    def test_live_full_game_prefix_is_normalized_but_other_periods_are_not_reinterpreted(self):
        yes, no = normalize_market(self.market(title='Full Game: Over 50.5 points scored'), 'KXNCAAFTOTAL')
        self.assertEqual(yes['title'], 'Over 50.5 points scored')
        self.assertEqual(no['title'], 'Under 50.5 points scored')
        self.assertEqual(yes['contract_title'], 'Full Game: Over 50.5 points scored')
        self.assertEqual(no['yes_ask'], .42)
        self.assertEqual(yes['point'], 50.5)
        rows = normalize_market(self.market(title='First Half: Over 50.5 points scored'), 'KXNCAAFTOTAL')
        self.assertEqual(rows, [])

    def test_identity_groups_do_not_cross_event_dates_and_native_no_settles_as_no(self):
        names = teams_by_event([{'event_ticker': 'KXNCAAFGAME-26OCT17AWYHOM', 'title': 'Home wins'},
                                {'event_ticker': 'KXNCAAFGAME-26OCT17AWYHOM', 'title': 'Away wins'},
                                {'event_ticker': 'KXNCAAFGAME-26OCT24AWYHOM', 'title': 'Other wins'}])
        self.assertEqual(set(names['26OCT17AWYHOM']), {'home', 'away'})
        row = {'ticker': 'contract', 'side': 'no', 'eventTime': '2026-10-16T00:00:00Z', 'closeTime': '2026-10-16T01:00:00Z'}
        settle_records([row], fetch=lambda ticker: {'status': 'settled', 'result': 'no'}, now=datetime(2026, 10, 17, tzinfo=timezone.utc))
        self.assertEqual(row['result'], 'win')


if __name__ == '__main__':
    unittest.main()
