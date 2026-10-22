import unittest
from datetime import datetime, timedelta, timezone

from scripts.update_public_starters import retain_nba_lineups


class NBALineupCacheTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 22, 1, 0, tzinfo=timezone.utc)
        self.names = ['First Player', 'Second Player', 'Third Player', 'Fourth Player', 'Fifth Player']
        self.row = dict(sport='nba', game_id='game', team='BOS', role='lineup',
                        players=self.names, status='confirmed',
                        checked_at=(self.now-timedelta(minutes=15)).isoformat(),
                        start_time=(self.now+timedelta(hours=1)).isoformat(),
                        source_url='https://www.nba.com/report')
        self.ctx = {'games': {'game': {'away': 'BOS', 'home': 'NYK', 'start': self.row['start_time']}},
                    'players': {str(i): {'name': n, 'team': 'BOS'} for i, n in enumerate(self.names)}}

    def test_empty_refresh_retains_lineup_without_retimestamp_or_injury_confirmation(self):
        rows, history = retain_nba_lineups([], {'records': [self.row, {**self.row, 'role': 'availability'}]}, self.ctx, self.now)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]['retained'])
        self.assertEqual(rows[0]['checked_at'], self.row['checked_at'])
        self.assertEqual(history, [])

    def test_unchanged_report_keeps_changed_time_but_records_new_check(self):
        row = {**self.row, 'checked_at': self.now.isoformat()}
        rows, _ = retain_nba_lineups([row], {'records': [self.row]}, self.ctx, self.now)
        self.assertEqual(rows[0]['changed_at'], self.row['checked_at'])
        self.assertEqual(rows[0]['checked_at'], self.now.isoformat())
        replacement = {**row, 'players': ['Replacement Player', *self.names[1:]]}
        rows, _ = retain_nba_lineups([replacement], {'records': [self.row]}, self.ctx, self.now)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['changed_at'], self.now.isoformat())
        self.assertNotIn('retained', rows[0])

    def test_expired_mismatched_or_traded_roster_cannot_be_retained(self):
        for patch in [dict(checked_at=(self.now-timedelta(hours=25)).isoformat()),
                      dict(game_id='another'), dict(start_time=(self.now+timedelta(hours=2)).isoformat()),
                      dict(source_url='javascript:bad'), dict(players=self.names[:4])]:
            with self.subTest(patch=patch):
                rows, _ = retain_nba_lineups([], {'records': [{**self.row, **patch}]}, self.ctx, self.now)
                self.assertEqual(rows, [])
        self.ctx['players']['0']['team'] = 'OTHER'
        self.assertEqual(retain_nba_lineups([], {'records': [self.row]}, self.ctx, self.now)[0], [])

    def test_started_lineup_moves_to_dated_history_and_old_history_expires(self):
        old = {**self.row, 'start_time': (self.now-timedelta(days=1)).isoformat(),
               'checked_at': (self.now-timedelta(days=1, hours=1)).isoformat()}
        rows, history = retain_nba_lineups([], {'records': [old]}, self.ctx, self.now)
        self.assertEqual(rows, [])
        self.assertEqual(history, [old])
        old['start_time'] = (self.now-timedelta(days=8)).isoformat()
        self.assertEqual(retain_nba_lineups([], {'nba_lineup_history': [old]}, self.ctx, self.now)[1], [])


if __name__ == '__main__':
    unittest.main()
