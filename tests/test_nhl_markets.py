import unittest
from scripts.update_kalshi_nhl import event_parts, half_line, normalize_market


class NhlMarketsTests(unittest.TestCase):
    def events(self, **patch):
        return [{'id': '10', 'date': '2026-10-03T23:00:00Z', 'status': {'type': {'state': 'pre'}},
                 'season': {'type': 2}, 'competitions': [{'competitors': [
                     {'homeAway': 'away', 'team': {'abbreviation': 'BOS', 'displayName': 'Boston Bruins', 'shortDisplayName': 'Bruins'}},
                     {'homeAway': 'home', 'team': {'abbreviation': 'NYR', 'displayName': 'New York Rangers', 'shortDisplayName': 'Rangers'}}]}], **patch}]

    def market(self, series='KXNHLTOTAL', tail='6', **patch):
        return {'ticker': series+'-26OCT03BOSNYR-'+tail, 'event_ticker': series+'-26OCT03BOSNYR',
                'status': 'active', 'title': 'Over 5.5 goals scored', 'volume': 1000,
                'yes_bid_dollars': '.54', 'yes_ask_dollars': '.58',
                'no_bid_dollars': '.42', 'no_ask_dollars': '.46', **patch}

    def test_totals_keep_both_actual_ask_prices(self):
        over, under = normalize_market(self.market(), 'KXNHLTOTAL', self.events())
        self.assertEqual((over['label'], under['label']), ('Over 5.5 goals', 'Under 5.5 goals'))
        self.assertEqual((over['yes_ask'], under['yes_ask']), (.58, .46))
        self.assertEqual(over['game_id'], under['game_id'])
        self.assertNotEqual(over['selection_id'], under['selection_id'])

    def test_puck_line_complement_selects_opponent_with_positive_sign(self):
        m = self.market('KXNHLSPREAD', 'BOS2', title='Boston wins by over 1.5 goals')
        yes, no = normalize_market(m, 'KXNHLSPREAD', self.events())
        self.assertEqual(yes['label'], 'Bruins -1.5 Puck line')
        self.assertEqual(no['label'], 'Rangers +1.5 Puck line')
        self.assertEqual(no['team_code'], 'NYR')

    def test_moneyline_does_not_duplicate_opposing_contract(self):
        rows = normalize_market(self.market('KXNHLGAME', 'BOS'), 'KXNHLGAME', self.events())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['label'], 'Bruins ML')

    def test_unknown_started_and_ambiguous_schedule_are_excluded(self):
        for events in [[], self.events(status={'type': {'state': 'in'}}), self.events()*2]:
            self.assertEqual(normalize_market(self.market(), 'KXNHLTOTAL', events), [])
        self.assertEqual(normalize_market(self.market(status='closed'), 'KXNHLTOTAL', self.events()), [])

    def test_aliases_and_date_validation(self):
        self.assertEqual(event_parts('KXNHLGAME-26OCT03LAKSJS')[1], ('LA', 'SJ'))
        self.assertEqual(event_parts('KXNHLGAME-26OCT031900NJDNYR')[1], ('NJ', 'NYR'))
        self.assertIsNone(event_parts('KXNHLGAME-26FEB31BOSNYR'))
        self.assertIsNone(event_parts('KXNHLGAME-26OCT03BADBOS'))

    def test_integer_thresholds_are_converted_only_with_exact_rules(self):
        self.assertEqual(half_line({'floor_strike': 6, 'strike_type': 'greater_or_equal'}, 'total'), 5.5)
        self.assertEqual(half_line({'floor_strike': 5, 'strike_type': 'greater'}, 'total'), 5.5)
        self.assertIsNone(half_line({'floor_strike': 6, 'strike_type': 'custom'}, 'total'))

    def test_absent_and_crossed_quotes_do_not_create_selections(self):
        self.assertEqual(normalize_market(self.market(yes_bid_dollars=None, yes_ask_dollars=None,
                         no_bid_dollars=None, no_ask_dollars=None), 'KXNHLTOTAL', self.events()), [])
        self.assertEqual(normalize_market(self.market(yes_bid_dollars='.8', yes_ask_dollars='.6',
                         no_bid_dollars='.4', no_ask_dollars='.2'), 'KXNHLTOTAL', self.events()), [])

if __name__ == '__main__':
    unittest.main()
