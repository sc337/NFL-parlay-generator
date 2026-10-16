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

    def goalie_fixture(self):
        ctx = {'games': {'1': {'away': 'BOS', 'home': 'COL', 'start': START}}, 'rosters': [
            {'name': 'Away Goalie', 'team': 'BOS', 'position': 'G'}, {'name': 'Home Goalie', 'team': 'COL', 'position': 'G'}]}
        row = {'dateGmt': START, 'homeGoalieName': 'Home Goalie', 'awayGoalieName': 'Away Goalie',
               'homeNewsStrengthName': 'Confirmed', 'awayNewsStrengthName': 'Unconfirmed', 'homeNewsCreatedAt': NOW.isoformat()}
        return ctx, row

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
