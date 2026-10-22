import copy
import json
import unittest
from datetime import datetime, timezone, timedelta
from scripts.update_public_starters import parse_nba, parse_goalies, parse_lines, collect

NOW = datetime(2026, 10, 16, 20, tzinfo=timezone.utc)
START = '2026-10-17T01:00:00Z'

def hydration(data):
    return '<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props': {'pageProps': data}})+'</script>'

class PublicStarterTests(unittest.TestCase):
    def nba(self, status='expected', day='2026-10-16'):
        ctx = {'games': {'1': {'away': 'BOS', 'home': 'NYK', 'start': START}}, 'players': {}}
        html = '<main data-gamedate="'+day+'"><div class="lineup is-nba"><div class="lineup__abbr">BOS</div><div class="lineup__abbr">NY</div>'
        for side, team in [('visit', 'BOS'), ('home', 'NYK')]:
            html += '<ul class="lineup__list is-'+side+'"><li class="lineup__status is-'+status+'">'+status.title()+' Lineup</li>'
            for i in range(5):
                name = team+' Player '+str(i); ctx['players'][name] = {'team': team, 'name': name}
                html += '<li class="lineup__player"><a title="'+name+'">short</a></li>'
            html += '<li class="lineup__title">MAY NOT PLAY</li><li class="lineup__player"><a title="Excluded Player">Out</a></li></ul>'
        return html+'</div></main>', ctx

    def test_expected_is_not_confirmed_and_out_section_excluded(self):
        html, ctx = self.nba(); rows = parse_nba(html, ctx, NOW)
        self.assertEqual(len(rows), 2); self.assertTrue(all(r['status'] == 'projected' for r in rows))
        self.assertTrue(all(len(r['players']) == 5 for r in rows))

    def test_confirmed_requires_exact_status_identity_and_date(self):
        html, ctx = self.nba('confirmed'); self.assertEqual(parse_nba(html, ctx, NOW)[0]['status'], 'confirmed')
        self.assertEqual(parse_nba(html.replace('Confirmed Lineup', 'Unconfirmed Lineup'), ctx, NOW), [])
        bad = copy.deepcopy(ctx); bad['players'].pop('BOS Player 0'); self.assertEqual(len(parse_nba(html, bad, NOW)), 1)
        html, ctx = self.nba(day='2026-10-17'); self.assertEqual(parse_nba(html, ctx, NOW), [])

    def test_confirmations_still_match_tonights_context_after_utc_midnight(self):
        html, ctx = self.nba('confirmed')
        after_midnight = datetime(2026, 10, 17, 0, 30, tzinfo=timezone.utc)
        rows = parse_nba(html, ctx, after_midnight)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row['status'] == 'confirmed' and row['game_id'] == '1'
                            for row in rows))

    def goalie_fixture(self):
        ctx = {'games': {'1': {'away': 'BOS', 'home': 'COL', 'start': START}}, 'rosters': [
            {'name': 'Away Goalie', 'team': 'BOS', 'position': 'G'}, {'name': 'Home Goalie', 'team': 'COL', 'position': 'G'}]}
        row = {'dateGmt': START, 'homeGoalieName': 'Home Goalie', 'awayGoalieName': 'Away Goalie',
               'homeNewsStrengthName': 'Confirmed', 'awayNewsStrengthName': 'Unconfirmed', 'homeNewsCreatedAt': NOW.isoformat()}
        return ctx, row

    def test_nba_public_injuries_and_positions_require_explicit_roster_match(self):
        html, ctx = self.nba()
        html = html.replace('<a title="BOS Player 0">', '<div class="lineup__pos">PG</div><a title="BOS Player 0">')
        injury = '<li class="lineup__player"><a title="BOS Reserve">Reserve</a><span class="lineup__inj">Ques</span></li>'
        ctx['players']['reserve'] = {'team': 'BOS', 'name': 'BOS Reserve'}
        html = html.replace('</ul>', injury+'</ul>', 1)
        rows = parse_nba(html, ctx, NOW)
        self.assertEqual(rows[0]['role'], 'availability')
        self.assertEqual(rows[0]['status'], 'questionable')
        self.assertEqual(rows[0]['players'], ['BOS Reserve'])
        self.assertEqual(rows[1]['positions'], {'BOS Player 0': 'PG'})
        self.assertEqual(rows[1]['status'], 'projected')
        self.assertNotIn('minutes', rows[1])
        self.assertEqual(len(parse_nba(html.replace('Ques', 'Unknown'), ctx, NOW)), 2)
        ctx['players']['reserve']['team'] = 'NYK'
        self.assertEqual(len(parse_nba(html, ctx, NOW)), 2)

    def test_nba_context_uses_visible_named_book_without_promoting_reference_prices(self):
        html, ctx = self.nba()
        extra = '<div class="lineup__umpire"><b>Referees:</b><a href="/basketball/ref.php?id=1">Ref One</a></div>'
        extra += '<div class="lineup__odds-item"><b>SPREAD</b><span class="draftkings hide">NYK -5.5</span><span class="fanduel">NYK -4.5</span></div>'
        html = html.replace('</div></main>', extra+'</div></main>')
        context = parse_nba(html, ctx, NOW)[0]['game_context']
        self.assertEqual(context, {'referees': ['Ref One'], 'reference_lines': {'spread': {'value': 'NYK -4.5', 'book': 'FanDuel'}}})
        ambiguous = parse_nba(html.replace('draftkings hide', 'draftkings'), ctx, NOW)[0]['game_context']
        self.assertNotIn('reference_lines', ambiguous)
        self.assertEqual(parse_nba(html.replace('2026-10-16', '2026-10-17'), ctx, NOW), [])

    def test_goalie_confirmation_not_substring_or_stale_news(self):
        ctx, row = self.goalie_fixture(); rows, _ = parse_goalies(hydration({'data': [row]}), ctx, NOW, 'https://example.com')
        self.assertEqual([r['status'] for r in rows], ['confirmed', 'projected'])
        row['homeNewsCreatedAt'] = (NOW-timedelta(days=3)).isoformat()
        self.assertTrue(all(r['status'] == 'projected' for r in parse_goalies(hydration({'data': [row]}), ctx, NOW, 'https://example.com')[0]))
        ctx['rosters'][0]['team'] = 'NYR'; self.assertEqual(parse_goalies(hydration({'data': [row]}), ctx, NOW, 'https://example.com')[0], [])

    def test_failed_public_sources_return_no_old_confirmation(self):
        class Offline:
            def get(self, url):
                raise OSError('offline')
        result = collect(NOW, Offline())
        self.assertEqual(result['records'], [])
        self.assertTrue(all(not c['ok'] for c in result['checks']))

    def test_last_game_lines_remain_reported_and_cannot_move_teams(self):
        ctx, _ = self.goalie_fixture(); ctx['rosters'].append({'name': 'Skater Name', 'team': 'COL'})
        data = {'combinations': {'teamAbbreviation': 'COL', 'updatedAt': NOW.isoformat(), 'sourceName': 'Last Game',
            'players': [{'name': 'Skater Name', 'categoryIdentifier': 'ev', 'groupIdentifier': 'f1'}]}}
        rows = parse_lines(hydration(data), ctx, 'COL', NOW, 'https://example.com')
        self.assertEqual(rows[0]['status'], 'reported')
        data['combinations']['updatedAt'] = (NOW-timedelta(days=3)).isoformat()
        self.assertEqual(parse_lines(hydration(data), ctx, 'COL', NOW, 'https://example.com'), [])

if __name__ == '__main__':
    unittest.main()
