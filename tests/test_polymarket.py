import copy
import json
import unittest
from datetime import datetime, timedelta, timezone

from scripts.update_polymarket import discover, enrich, match_event, quote, selections
from scripts.refresh_price_worker import valid_snapshot

NOW = datetime(2026, 10, 23, 1, tzinfo=timezone.utc)
START = '2026-10-25T13:30:00+00:00'
GAME = {'game_id': 'native', 'espn_game_id': '1234', 'game_time': START, 'game_status': 'pre',
        'checked_at': NOW.isoformat(), 'game_label': 'Pittsburgh Steelers at New Orleans Saints',
        'away': {'id': '23', 'displayName': 'Pittsburgh Steelers', 'abbreviation': 'PIT'},
        'home': {'id': '18', 'displayName': 'New Orleans Saints', 'abbreviation': 'NO'}, 'season_type': 2}


def market(kind='moneyline', **patch):
    m = {'id': '100', 'question': 'Steelers vs. Saints', 'active': True, 'closed': False,
         'acceptingOrders': True, 'enableOrderBook': True, 'gameStartTime': START,
         'sportsMarketType': kind, 'description': 'Overtime is included if played. Canceled games resolve 50-50.',
         'conditionId': 'condition', 'outcomes': '["Steelers","Saints"]', 'clobTokenIds': '["101","102"]',
         'volumeNum': 1000, 'version': 'v1', 'outcomePrices': '["0.99","0.01"]'}
    m.update(patch)
    return m


def event(m=None, **patch):
    e = {'id': '1', 'active': True, 'closed': False, 'startTime': START, 'title': 'Steelers vs. Saints',
         'markets': [m or market()]}
    return {**e, **patch}


def book(token='101', **patch):
    return {'asset_id': token, 'market': 'condition', 'timestamp': str(int(NOW.timestamp()*1000)),
            'bids': [{'price': '.54', 'size': '100'}], 'asks': [{'price': '.56', 'size': '100'}],
            'min_order_size': '5', **patch}


def snapshot(rows=None):
    return {'updated_at': NOW.isoformat(), 'primary_updated_at': NOW.isoformat(),
            'games': [{'id': 'native', 'home': 'New Orleans Saints', 'away': 'Pittsburgh Steelers',
                       'commence_time': START, 'game_status': 'pre', 'markets': rows or []}],
            'slate': {'source': 'ESPN', 'updated_at': NOW.isoformat(), 'games': [copy.deepcopy(GAME)]}}


def fetcher(events=None, books=None):
    def fetch(url, body=None):
        if url.endswith('/sports'):
            return [{'sport': 'nfl', 'primaryTagId': 450}]
        if '/events?' in url:
            return events if events is not None else [event()]
        if url.endswith('/books'):
            return books if books is not None else [book('101'), book('102')]
        raise AssertionError(url)
    return fetch


class PolymarketBackup(unittest.TestCase):
    def test_discovery_resolves_official_league_id_and_paginates(self):
        urls = []
        def fetch(url):
            urls.append(url)
            if url.endswith('/sports'):
                return [{'sport': 'nfl', 'primaryTagId': 450}]
            return [event(id=str(i)) for i in range(100)] if 'offset=0' in url else [event(id='next')]
        self.assertEqual(len(discover('nfl', NOW, fetch)), 101)
        self.assertTrue(all('tag_id=450' in u for u in urls[1:]))
        self.assertTrue(all('tag_slug' not in u for u in urls))
        self.assertIn('offset=100', urls[-1])

    def test_exact_teams_and_kickoff_required_not_market_creation_or_end_date(self):
        self.assertEqual(match_event('nfl', event(), [GAME], NOW), GAME)
        for patch in [{'title': 'Steelers vs. Buccaneers'}, {'startTime': None, 'startDate': START, 'endDate': START},
                      {'startTime': '2026-10-26T13:30:00Z'}, {'live': True}, {'active': False}]:
            self.assertIsNone(match_event('nfl', event(**patch), [GAME], NOW))
        self.assertIsNone(match_event('nfl', event(), [GAME, GAME], NOW))
        self.assertIsNone(match_event('nfl', event(), [{**GAME, 'checked_at': (NOW-timedelta(hours=3)).isoformat()}], NOW))

    def test_order_book_price_depth_and_source_time_are_authoritative(self):
        q = quote(book(), '101', 'condition', NOW)
        self.assertEqual(q['yes_ask'], .56)
        self.assertEqual(q['price'], -127)
        self.assertEqual(q['quotedAt'], NOW.isoformat())
        self.assertEqual(q['askDepth'], 100)
        # Arrays are not assumed to be sorted.
        b = book(bids=[{'price': '.40', 'size': '5'}, {'price': '.54', 'size': '5'}],
                 asks=[{'price': '.90', 'size': '100'}, {'price': '.56', 'size': '100'}])
        self.assertEqual(quote(b, '101', 'condition', NOW)['yes_ask'], .56)

    def test_rejects_stale_future_crossed_wide_wrong_token_and_thin_books(self):
        patches = [{'timestamp': str(int((NOW-timedelta(hours=1)).timestamp()*1000))},
                   {'timestamp': str(int((NOW+timedelta(hours=1)).timestamp()*1000))}, {'timestamp': None},
                   {'asset_id': 'other'}, {'market': 'other'}, {'bids': []}, {'asks': []},
                   {'bids': [{'price': '.60', 'size': '100'}]},
                   {'bids': [{'price': '.10', 'size': '100'}]},
                   {'asks': [{'price': '.56', 'size': '4'}]},
                   {'asks': [{'price': '.56', 'size': '8'}]}]
        for patch in patches:
            self.assertIsNone(quote(book(**patch), '101', 'condition', NOW), patch)

    def test_version_two_uses_position_ids_and_never_substitutes_legacy_tokens(self):
        m = market(version='v2', positionIds=['201', '202'])
        rows = selections('nfl', m, event(m), GAME, snapshot(), {})
        self.assertEqual([x[0] for x in rows], ['201', '202'])
        self.assertEqual(selections('nfl', {**m, 'positionIds': []}, event(m), GAME, snapshot(), {}), [])

    def test_spread_sides_and_signed_lines_are_preserved(self):
        m = market('spreads', line=-3.5, question='Spread: Steelers (-3.5)')
        rows = selections('nfl', m, event(m), GAME, snapshot(), {})
        self.assertEqual([(m['team'], m['point']) for _, m in rows], [('Pittsburgh Steelers', -3.5), ('New Orleans Saints', 3.5)])
        for patch in [{'line': -3}, {'line': -4.5}, {'question': 'First Half Spread: Steelers (-3.5)'}]:
            self.assertEqual(selections('nfl', {**m, **patch}, event(m), GAME, snapshot(), {}), [])

    def test_total_line_and_full_game_overtime_rules_must_match(self):
        m = market('totals', line=49.5, question='Steelers vs. Saints: O/U 49.5', outcomes='["Over","Under"]')
        rows = selections('nfl', m, event(m), GAME, snapshot(), {})
        self.assertEqual([r['side'] for _, r in rows], ['over', 'under'])
        for patch in [{'line': 50.5}, {'description': 'Regulation time only'}, {'gameStartTime': '2026-10-26T13:30Z'}]:
            self.assertEqual(selections('nfl', {**m, **patch}, event(m), GAME, snapshot(), {}), [])
        included = {**m, 'description': 'The result is the final score including any overtime periods.'}
        self.assertEqual(len(selections('nba', included, event(included), GAME, {'markets': []}, {})), 2)

    def test_ufc_card_prefix_and_weight_class_do_not_break_exact_fighter_identity(self):
        game = {**GAME, 'fighter1': 'Nicolle Caliari', 'fighter2': 'Iasmin Lucindo'}
        e = event(title="UFC 333: Nicolle Caliari vs. Iasmin Lucindo (Women's Strawweight, Early Prelims)")
        self.assertEqual(match_event('ufc', e, [game], NOW), game)
        e['title'] = 'UFC 333: Nicolle Caliari vs. Other Lucindo (Early Prelims)'
        self.assertIsNone(match_event('ufc', e, [game], NOW))

    def test_props_require_exact_player_roster_and_preserve_count_threshold(self):
        template = {'player': 'Aaron Rodgers', 'team': 'Pittsburgh Steelers', '_rosterVerified': True,
                    'marketKey': 'player_pass_yds', 'propHistory': {'games': 6}, 'price': -110}
        s = snapshot([template])
        m = market('passing_yards', line=199.5, question='Aaron Rodgers: Passing Yards O/U 199.5', outcomes='["Over","Under"]')
        rows = selections('nfl', m, event(m), GAME, s, {})
        self.assertEqual(rows[0][1]['point'], 199.5)
        self.assertEqual(rows[0][1]['marketKey'], 'player_pass_yds')
        self.assertTrue(rows[0][1]['_rosterVerified'])
        self.assertEqual(rows[0][1]['propHistory'], {'games': 6})
        self.assertNotIn('price', rows[0][1])
        self.assertEqual(selections('nfl', m, event(m), GAME, snapshot(), {}), [])
        s['games'][0]['markets'][0]['_rosterVerified'] = False
        self.assertEqual(selections('nfl', m, event(m), GAME, s, {}), [])
        self.assertEqual(selections('nfl', {**m, 'question': 'Aaron Rodgers Jr: Passing Yards O/U 199.5'}, event(m), GAME, snapshot([template]), {}), [])

    def test_core_markets_adapt_to_each_team_sport_schema(self):
        for sport in ('nba', 'nhl', 'mlb', 'ncaaf'):
            game = copy.deepcopy(GAME)
            if sport == 'ncaaf':
                m = market(outcomes='["Pittsburgh Steelers","New Orleans Saints"]')
            else:
                m = market()
            rows = selections(sport, m, event(m), game, {'markets': []}, {})
            self.assertEqual(len(rows), 2, sport)
            self.assertEqual(rows[0][1]['kind'], 'moneyline')
            self.assertEqual(rows[0][1]['team_id'], '23')

    def test_healthy_primary_wins_and_missing_selections_use_real_asks(self):
        native = {'type': 'h2h', 'kind': 'moneyline', 'team': 'Pittsburgh Steelers', 'gameId': 'native',
                  'source': 'Kalshi', 'sourceQuality': 80, 'price': -130, 'quotedAt': NOW.isoformat()}
        s = snapshot([native])
        result = enrich('nfl', s, {}, NOW, fetcher())
        rows = result['games'][0]['markets']
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], native)
        self.assertEqual(rows[1]['source'], 'Polymarket')
        self.assertEqual(rows[1]['price'], -127)  # Not Gamma's .01 indicative price.
        self.assertTrue(rows[1]['referenceOnly'])
        self.assertIn('settlementRules', rows[1])
        self.assertEqual(result['polymarket']['markets_added'], 1)
        self.assertEqual(s, snapshot([native]))

    def test_source_failure_preserves_previous_quotes_and_original_times(self):
        old = snapshot([{'source': 'Polymarket', 'quotedAt': 'old'}])
        def failed(*args):
            raise OSError('unavailable')
        result = enrich('nfl', old, {}, NOW, failed)
        self.assertEqual(result['games'], old['games'])
        self.assertEqual(result['updated_at'], old['updated_at'])
        self.assertEqual(result['polymarket']['status'], 'unavailable')

    def test_successful_empty_book_response_removes_suspended_backup_only(self):
        native = {'source': 'Kalshi', 'quotedAt': 'old'}
        result = enrich('nfl', snapshot([native, {'source': 'Polymarket'}]), {}, NOW, fetcher(books=[]))
        self.assertEqual(result['games'][0]['markets'], [native])
        self.assertEqual(result['polymarket']['markets_added'], 0)

    def test_refresh_deduplicates_and_does_not_retimestamp_primary(self):
        old = (NOW-timedelta(hours=1)).isoformat()
        native = {'source': 'Kalshi', 'quotedAt': old}
        first = enrich('nfl', snapshot([native]), {}, NOW, fetcher())
        second = enrich('nfl', first, {}, NOW, fetcher())
        self.assertEqual(first['games'], second['games'])
        self.assertEqual(second['games'][0]['markets'][0]['quotedAt'], old)

    def test_backup_recovers_outage_without_claiming_primary_is_fresh(self):
        s = snapshot();s['primary_updated_at'] = (NOW-timedelta(hours=1)).isoformat()
        result = enrich('nfl', s, {}, NOW, fetcher())
        valid_snapshot(result, 'nfl', now=NOW.timestamp())
        self.assertEqual(result['primary_updated_at'], s['primary_updated_at'])
        for g in result['games']:
            for row in g['markets']:
                row['quotedAt'] = s['primary_updated_at']
        with self.assertRaises(ValueError):
            valid_snapshot(result, 'nfl', now=NOW.timestamp())


if __name__ == '__main__':
    unittest.main()
