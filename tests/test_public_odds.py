import copy
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from scripts.update_public_odds import enrich, normalize, resolve, slot, healthy, collect
from tests.test_ncaaf_slate import event

NOW = datetime(2026, 10, 17, 4, tzinfo=timezone.utc)
AT = NOW.isoformat()


def fixture():
    e = event();e['season'] = {'type': 2}
    e['competitions'][0]['competitors'][0]['team'].update(abbreviation='HOM', location='Home')
    e['competitions'][0]['competitors'][1]['team'].update(abbreviation='AWY', location='Away')
    return e


def base(sport, rows=None):
    rows = rows or []
    if sport == 'nfl':
        return {'updated_at': AT, 'games': [{'id': 'native-game', 'home': 'Home', 'away': 'Away',
                'commence_time': '2026-10-17T16:00Z', 'game_status': 'pre', 'markets': rows}]}
    return {'updated_at': AT, 'markets': rows}


class PublicOdds(unittest.TestCase):
    def test_all_team_sports_receive_attributed_core_markets_without_fake_liquidity(self):
        for sport in ['mlb', 'nba', 'ncaaf', 'nfl', 'nhl']:
            d = enrich(sport, base(sport), [fixture()], {}, NOW)
            rows = d['games'][0]['markets'] if sport == 'nfl' else d['markets']
            self.assertEqual(len(rows), 6, sport)
            self.assertTrue(all(m['referenceOnly'] and m['source'] == 'DraftKings via ESPN' for m in rows))
            self.assertTrue(all('volume' not in m and 'yes_bid' not in m for m in rows))
            self.assertEqual({m['kind'] for m in rows}, {'moneyline', 'spread', 'total'})

    def test_exact_healthy_native_selection_wins_but_different_line_is_added(self):
        native = {'game_id': '1', 'kind': 'moneyline', 'team': 'Home', 'label': 'Home',
                  'source': 'Kalshi', 'volume': 500, 'spread': .02, 'yes_ask': .6, 'quotedAt': AT}
        d = enrich('ncaaf', base('ncaaf', [native]), [fixture()], {}, NOW)
        self.assertEqual(len(d['markets']), 6)
        self.assertFalse(d['markets'][0].get('referenceOnly'))
        self.assertFalse(any(m.get('referenceOnly') and m['kind'] == 'moneyline' and m['team'] == 'Home' for m in d['markets']))
        native = {**native, 'kind': 'spread', 'point': -2.5}
        d = enrich('ncaaf', base('ncaaf', [native]), [fixture()], {}, NOW)
        self.assertEqual(len(d['markets']), 7)
        self.assertTrue(any(m.get('referenceOnly') and m['point'] == -3 for m in d['markets']))

    def test_stale_wide_and_zero_volume_native_quotes_do_not_block_reference(self):
        for patch_row in [{'quotedAt': (NOW-timedelta(hours=1)).isoformat()}, {'spread': .5}, {'volume': 0}]:
            native = {'game_id': '1', 'kind': 'moneyline', 'team': 'Home', 'source': 'Kalshi', 'volume': 500,
                      'spread': .02, 'yes_ask': .6, 'quotedAt': AT, **patch_row}
            d = enrich('nhl', base('nhl', [native]), [fixture()], {}, NOW)
            self.assertTrue(any(m.get('referenceOnly') and m['kind'] == 'moneyline' and m['team'] == 'Home' for m in d['markets']))
            self.assertEqual(d['markets'][0]['quotedAt'], native['quotedAt'])

    def test_public_refresh_never_retimestamps_native_quotes_or_accumulates_duplicates(self):
        old = (NOW-timedelta(hours=1)).isoformat()
        native = {'ticker': 'KX-1', 'game_id': '1', 'kind': 'moneyline', 'team': 'Home', 'yes_ask': .6, 'spread': .02, 'volume': 500}
        original = base('ncaaf', [native]);original['updated_at'] = old
        a = enrich('ncaaf', original, [fixture()], {}, NOW)
        b = enrich('ncaaf', a, [fixture(), fixture()], {}, NOW+timedelta(minutes=10))
        self.assertEqual(a['markets'][0]['quotedAt'], old)
        self.assertEqual(b['markets'][0]['quotedAt'], old)
        self.assertEqual(len(a['markets']), len(b['markets']))
        self.assertTrue(all(m['quotedAt'] == (NOW+timedelta(minutes=10)).isoformat() for m in b['markets'] if m.get('referenceOnly')))
        self.assertNotIn('quotedAt', original['markets'][0])

    def test_mlb_official_ids_require_both_teams_and_exact_doubleheader_start(self):
        g = normalize([fixture()], NOW)[0][0]
        ctx = {'games': [{'gamePk': 10, 'home': 'Home', 'away': 'Away', 'gameDate': '2026-10-17T16:00Z'},
                         {'gamePk': 11, 'home': 'Home', 'away': 'Away', 'gameDate': '2026-10-17T20:00Z'}]}
        self.assertEqual(resolve('mlb', g, {}, ctx)['game_id'], '10')
        ctx['games'][0]['away'] = 'Other'
        self.assertTrue(resolve('mlb', g, {}, ctx)['context_unmatched'])
        self.assertEqual(resolve('mlb', g, {}, ctx)['game_id'], '1')

    def test_nhl_official_context_mapping_and_signed_sides(self):
        ctx = {'games': {'native': {'home': 'HOM', 'away': 'AWY', 'start': '2026-10-17T16:00Z'}}}
        rows = enrich('nhl', base('nhl'), [fixture()], ctx, NOW)['markets']
        self.assertTrue(all(m['context_game_id'] == 'native' for m in rows))
        self.assertEqual([m['side'] for m in rows if m['kind'] == 'spread'], ['yes', 'no'])
        self.assertEqual([m['side'] for m in rows if m['kind'] == 'total'], ['yes', 'no'])
        self.assertEqual([m['line'] for m in rows if m['kind'] == 'spread'], [3, 3])

    def test_nba_preseason_tag_survives_normalization(self):
        e = fixture();e['season']['type'] = 1
        d = enrich('nba', base('nba'), [e], {}, NOW)
        self.assertTrue(all(m['season_type'] == 1 for m in d['markets']))

    def test_schedule_only_events_and_missing_current_prices_do_not_invent_quotes(self):
        e = fixture();e['competitions'][0]['odds'] = []
        d = enrich('mlb', base('mlb'), [e], {}, NOW)
        self.assertEqual(len(d['slate']['games']), 1)
        self.assertEqual(d['markets'], [])

    def test_nfl_preserves_game_context_and_maps_types_without_creating_props(self):
        d = base('nfl');d['games'][0]['context'] = {'updated_at': AT, 'verified': True}
        result = enrich('nfl', d, [fixture()], {}, NOW)
        g = result['games'][0]
        self.assertEqual(len(result['games']), 1)
        self.assertEqual(g['context'], d['games'][0]['context'])
        self.assertEqual({m['type'] for m in g['markets']}, {'h2h', 'spreads', 'totals'})
        self.assertTrue(all(m['gameId'] == 'native-game' for m in g['markets']))
        self.assertTrue(all(not m.get('player') for m in g['markets']))

    def test_ufc_schedule_does_not_fabricate_fighter_prices(self):
        e = fixture();c = e['competitions'][0];c['id'] = 'bout'
        c['competitors'] = [{'athlete': {'displayName': 'Fighter One'}}, {'athlete': {'displayName': 'Fighter Two'}}]
        d = enrich('ufc', base('ufc'), [e], {}, NOW)
        self.assertEqual(len(d['slate']['games']), 1)
        self.assertEqual(d['markets'], [])

    def test_scoreboard_error_payload_is_not_an_empty_slate(self):
        with self.assertRaises(ValueError):
            collect('nba', NOW, fetch=lambda _: {'error': 'unavailable'})
        self.assertEqual(collect('nba', NOW, fetch=lambda _: {'events': []}), [])

    def test_primary_outage_can_recover_with_public_prices_without_refreshing_old_quotes(self):
        from scripts import refresh_price_worker as worker
        import os
        with tempfile.TemporaryDirectory() as directory:
            before = os.getcwd()
            try:
                os.chdir(directory);Path('data').mkdir()
                now = datetime.now(timezone.utc)
                old = (now-timedelta(hours=1)).isoformat()
                original = {'updated_at': old, 'markets': [{'ticker': 'native', 'game_id': '1',
                    'kind': 'moneyline', 'team': 'Home', 'game_time': (now+timedelta(days=1)).isoformat(),
                    'yes_ask': .6, 'volume': 500, 'spread': .02}]}
                Path('data/kalshi-mlb.json').write_text(json.dumps(original))
                Path('data/mlb-context.json').write_text('{}')
                def run(args, **kwargs):
                    if args[1].endswith('update_public_odds.py'):
                        e = fixture();e['date'] = (now+timedelta(days=1)).isoformat()
                        result = enrich('mlb', original, [e], {}, now)
                        Path('data/kalshi-mlb.json').write_text(json.dumps(result))
                    else:
                        raise OSError('primary unavailable')
                with patch.object(worker, 'run', side_effect=run):
                    self.assertTrue(worker.refresh('mlb'))
                result = json.loads(Path('data/kalshi-mlb.json').read_text())
                self.assertEqual(result['markets'][0]['quotedAt'], old)
                self.assertTrue(any(m.get('referenceOnly') for m in result['markets']))
            finally:
                os.chdir(before)

    def test_outage_does_not_replace_prior_snapshot(self):
        from scripts import update_public_odds as updater
        with tempfile.TemporaryDirectory() as directory:
            import os
            before = os.getcwd()
            try:
                os.chdir(directory);Path('data').mkdir();p = Path('data/kalshi-mlb.json');p.write_text('{"original":true}')
                with patch.object(updater, 'collect', side_effect=OSError('offline')):
                    self.assertFalse(updater.main('mlb'))
                self.assertEqual(json.loads(p.read_text()), {'original': True})
            finally:
                os.chdir(before)
