import unittest
from scripts.update_kalshi_mlb import normalize_market
from scripts.add_mlb_total_sides import upgrade


class MlbMarketSidesTests(unittest.TestCase):
    def market(self, **changes):
        return {'ticker': 'TOTAL-9', 'event_ticker': 'KXMLBTOTAL-26OCT031300CWSCLE',
                'title': 'Over 8.5 runs scored', 'status': 'active',
                'yes_bid_dollars': '0.54', 'yes_ask_dollars': '0.58',
                'no_bid_dollars': '0.42', 'no_ask_dollars': '0.46', **changes}

    def test_both_sides_use_their_own_asks_and_preserve_contract_identity(self):
        over, under = normalize_market(self.market(), 'KXMLBTOTAL')
        self.assertEqual(over['yes_ask'], .58)
        self.assertEqual(under['yes_ask'], .46)
        self.assertEqual(under['title'], 'Under 8.5 runs scored')
        self.assertEqual(under['ticker'], over['ticker'])
        self.assertNotEqual(under['selection_id'], over['selection_id'])
        self.assertEqual(under['side'], 'no')
        self.assertEqual(under['spread'], .04)

    def test_missing_no_ask_uses_opposite_bid_not_opposite_ask(self):
        _, under = normalize_market(self.market(no_ask_dollars=None), 'KXMLBTOTAL')
        self.assertEqual(under['yes_ask'], .46)
        self.assertNotEqual(under['yes_ask'], 1 - .58)

    def test_missing_no_quote_does_not_invent_an_under(self):
        rows = normalize_market(self.market(no_ask_dollars=None, yes_bid_dollars=None), 'KXMLBTOTAL')
        self.assertEqual([r['side'] for r in rows], ['yes'])

    def test_no_side_can_exist_without_yes_ask_and_supports_team_totals(self):
        rows = normalize_market(self.market(title='Will Cleveland score over 4.5 runs?',
                                           yes_ask_dollars=None, no_bid_dollars=None), 'KXMLBTEAMTOTAL')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'Will Cleveland score Under 4.5 runs?')
        self.assertEqual(rows[0]['yes_ask'], .46)

    def test_integer_lines_are_not_mislabeled_as_complementary_unders(self):
        rows = normalize_market(self.market(title='Over 8 runs scored'), 'KXMLBTOTAL')
        self.assertEqual([r['side'] for r in rows], ['yes'])

    def test_legacy_cent_quotes_and_closed_markets(self):
        m = {'ticker': 'T', 'title': 'Over 8.5 runs', 'yes_bid': 54, 'yes_ask': 58,
             'no_bid': 42, 'no_ask': 46}
        self.assertEqual(normalize_market(m, 'KXMLBTOTAL')[1]['yes_ask'], .46)
        self.assertEqual(normalize_market({**m, 'status': 'settled'}, 'KXMLBTOTAL'), [])

    def test_snapshot_upgrade_preserves_timestamp_context_and_is_idempotent(self):
        snapshot = {'generated_at': '2026-10-02T00:00:00Z', 'markets': [
            {'ticker': 'T', 'event_ticker': 'E', 'series': 'KXMLBTOTAL', 'kind': 'total',
             'title': 'Over 8.5 runs scored', 'label': 'Over 8.5 runs scored',
             'yes_bid': .54, 'yes_ask': .58, 'game_id': '10', 'game_time': 'START'}]}
        updated = upgrade(snapshot)
        self.assertEqual(updated['generated_at'], snapshot['generated_at'])
        self.assertEqual(len(updated['markets']), 2)
        self.assertEqual(updated['markets'][1]['yes_ask'], .46)
        self.assertEqual(updated['markets'][1]['game_id'], '10')
        self.assertEqual(upgrade(updated), updated)


if __name__ == '__main__':
    unittest.main()
