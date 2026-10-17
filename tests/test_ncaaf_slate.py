import unittest
from datetime import datetime, timezone
from scripts.update_ncaaf_slate import enrich, normalize

NOW = datetime(2026, 10, 17, 4, tzinfo=timezone.utc)


def event():
    return {'id': '1', 'date': '2026-10-17T16:00Z', 'competitions': [{
        'status': {'type': {'state': 'pre'}},
        'competitors': [{'homeAway': 'home', 'team': {'id': '2', 'displayName': 'Home'}},
                        {'homeAway': 'away', 'team': {'id': '3', 'displayName': 'Away'}}],
        'odds': [{'provider': {'id': '100', 'name': 'DraftKings'},
                  'moneyline': {'home': {'close': {'odds': '-150'}}, 'away': {'close': {'odds': '+130'}}},
                  'pointSpread': {'home': {'close': {'line': '-3', 'odds': '-110'}}, 'away': {'close': {'line': '+3', 'odds': '-110'}}},
                  'total': {'over': {'close': {'line': 'o50.5', 'odds': '-105'}}, 'under': {'close': {'line': 'u50.5', 'odds': '-115'}}}}]}]}


class NcaafSlate(unittest.TestCase):
    def test_full_slate_does_not_require_prices(self):
        e = event(); e['competitions'][0]['odds'] = []
        games, rows = normalize([e], NOW)
        self.assertEqual(len(games), 1)
        self.assertEqual(rows, [])

    def test_current_prices_are_attributed_and_signed(self):
        games, rows = normalize([event()], NOW)
        self.assertEqual(len(rows), 6)
        self.assertTrue(all(m['source'] == 'DraftKings via ESPN' and m['referenceOnly'] for m in rows))
        self.assertTrue(all('volume' not in m and 'yes_bid' not in m for m in rows))
        self.assertEqual([m['point'] for m in rows if m['kind'] == 'spread'], [-3, 3])
        self.assertEqual([m['probability'] for m in rows if m['kind'] == 'moneyline'][0], .6)

    def test_open_invalid_prices_and_started_games_never_substitute(self):
        e = event(); book = e['competitions'][0]['odds'][0]
        book['moneyline'] = {'home': {'open': {'odds': '-110'}}, 'away': {'close': {'odds': 'NaN'}}}
        self.assertFalse(any(m['kind'] == 'moneyline' for m in normalize([e], NOW)[1]))
        e['competitions'][0]['status']['type']['state'] = 'in'
        self.assertEqual(normalize([e], NOW), ([], []))

    def test_deduplication_and_timestamps_survive_merge(self):
        kalshi = {'ticker': 'KX-1', 'quotedAt': 'original'}
        payload = enrich({'updated_at': 'original', 'markets': [kalshi]}, [event(), event()], NOW)
        self.assertEqual(payload['updated_at'], 'original')
        self.assertEqual(payload['markets'][0], kalshi)
        self.assertEqual(len(payload['markets']), 7)
        self.assertEqual(len(enrich(payload, [event()], NOW)['markets']), 7)
        with self.assertRaises(ValueError):
            enrich(payload, [], NOW)
