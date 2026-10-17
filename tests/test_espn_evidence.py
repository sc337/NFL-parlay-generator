import unittest
from datetime import datetime, timedelta, timezone
from scripts.update_espn_evidence import injuries, annotate, observations
from scripts.settle_espn_reference import grade, settle_references

NOW = datetime(2026, 10, 17, 4, tzinfo=timezone.utc)
AT = NOW.isoformat()
START = '2026-10-16T12:00:00+00:00'


def final(a=4, b=2):
    return {'header': {'season': {'type': 2}, 'competitions': [{'id': '123', 'date': START,
        'status': {'period': 9, 'type': {'name': 'STATUS_FINAL', 'completed': True}},
        'competitors': [{'team': {'id': '1'}, 'score': str(a)}, {'team': {'id': '2'}, 'score': str(b)}]}]}}


def contract(**patch):
    return {'provider': 'ESPN', 'sport': 'nhl', 'eventId': '123', 'teams': ['1','2'], 'teamId': '1',
            'kind': 'moneyline', 'line': None, 'scope': 'full_game', 'eventTime': START, **patch}


class Evidence(unittest.TestCase):
    def test_report_date_and_team_are_preserved(self):
        data = {'injuries': [{'displayName': 'Team', 'injuries': [{'athlete': {'displayName': 'Player'}, 'status': 'Out', 'date': '2020-01-01T00:00Z'}]}]}
        r = injuries(data, NOW)[0]
        self.assertTrue(r['reportedAt'].startswith('2020'))
        self.assertEqual(r['team'], 'Team')

    def test_annotation_requires_exact_player_and_team_and_logs_status_changes(self):
        snapshot = {'markets': [{'player': 'Player', 'team': 'Team', 'game_time': (NOW+timedelta(days=1)).isoformat()}],
                    'espn_evidence': {'statuses': {'player|team': 'Questionable'}}}
        report = {'name': 'Player', 'team': 'Team', 'status': 'Out', 'reportedAt': AT}
        r = annotate(snapshot, [report], [], NOW)
        self.assertEqual(r['markets'][0]['espnEvidence']['availability']['status'], 'Out')
        self.assertEqual(r['espn_evidence']['changes'][0]['before'], 'Questionable')
        report['team'] = 'Wrong Team'
        self.assertIsNone(annotate(snapshot, [report], [], NOW)['markets'][0]['espnEvidence']['availability'])
        report['team'] = 'Team'
        self.assertIsNone(annotate(snapshot, [report,report], [], NOW)['markets'][0]['espnEvidence']['availability'])

    def test_outage_preserves_prior_dated_evidence(self):
        old = {'checkedAt': '2026-10-16T00:00Z', 'availability': {'status': 'Out'}}
        s = {'markets': [{'player': 'Player', 'team': 'Team', 'espnEvidence': old}]}
        self.assertEqual(annotate(s, [], [], NOW, False)['markets'][0]['espnEvidence'], old)

    def test_usage_requires_completed_games_and_excludes_preseason(self):
        s = final();s['boxscore'] = {'players': [{'team': {'displayName': 'Team'}, 'statistics': [{'labels': ['MIN'],
             'athletes': [{'athlete': {'displayName': 'Player'}, 'stats': ['20:30']}]}]}]}
        r = observations(s, NOW);self.assertEqual(r[0]['value'], 20.5)
        s['header']['season']['type'] = 1
        self.assertEqual(observations(s, NOW), [])
        s = final();s['header']['competitions'][0]['status']['type']['completed'] = False
        self.assertEqual(observations(s, NOW), [])

    def test_full_game_results_signed_spreads_totals_and_pushes(self):
        s = final()
        self.assertEqual(grade(contract(), s), 'win')
        self.assertEqual(grade(contract(teamId='2'), s), 'loss')
        self.assertEqual(grade(contract(kind='spread', teamId='2', line=2), s), 'push')
        self.assertEqual(grade(contract(kind='spread', teamId='2', line=2.5), s), 'win')
        self.assertEqual(grade(contract(kind='total', line=5.5, direction='under'), s), 'loss')
        self.assertEqual(grade(contract(kind='total', line=6, direction='over'), s), 'push')

    def test_postponements_mismatches_ties_and_shortened_baseball_stay_pending(self):
        self.assertIsNone(grade(contract(scope='first_period'), final()))
        self.assertIsNone(grade(contract(teams=['9','2']), final()))
        self.assertIsNone(grade(contract(), final(2,2)))
        s = final();s['header']['competitions'][0]['status']['type']['name'] = 'STATUS_POSTPONED'
        self.assertIsNone(grade(contract(), s))
        s = final();s['header']['competitions'][0]['status']['period'] = 7
        self.assertIsNone(grade(contract(sport='mlb'), s))

    def test_baseball_line_scores_prove_nine_innings_when_header_period_is_missing(self):
        s = final();c = s['header']['competitions'][0];del c['status']['period']
        self.assertIsNone(grade(contract(sport='mlb'), s))
        c['competitors'][0]['linescores'] = [{}]*8
        c['competitors'][1]['linescores'] = [{}]*9
        self.assertEqual(grade(contract(sport='mlb'), s), 'win')
        c['competitors'][1]['linescores'] = [{}]*7
        self.assertIsNone(grade(contract(sport='mlb'), s))

    def test_mlb_contract_symbol_and_nfl_game_time_are_mapped_for_usage(self):
        report = {'name':'Player','team':'Tampa Bay Rays','status':'Out','reportedAt':AT}
        m = {'kind':'hits','label':'Player: 1+ hits','ticker':'KXMLBHIT-EVENT-TBPLAYER-1',
             'event_ticker':'KXMLBHIT-EVENT','game_label':'Tampa Bay Rays at Cleveland Guardians','game_time':AT}
        r = annotate({'markets':[m]}, [report], [], NOW)
        self.assertEqual(r['markets'][0]['espnEvidence']['availability']['status'], 'Out')
        m = {'player':'Player','team':'Team'}
        r = annotate({'games':[{'away':'Team','home':'Other','commence_time':AT,'markets':[m]}]}, [], [], NOW)
        self.assertEqual(r['games'][0]['markets'][0]['espnEvidence']['eventTime'], AT)

    def test_only_frozen_pregame_forecasts_settle_and_fetches_are_cached(self):
        c = contract();row = {'settlement': c, 'eventTime': START, 'recordedAt': '2026-10-16T11:00Z', 'result': None}
        rows = [dict(row), dict(row), {**row, 'recordedAt': '2026-10-16T13:00Z'}];seen = []
        def fetch(sport, event):
            seen.append((sport,event));return final()
        self.assertEqual(settle_references(rows, fetch, NOW), 2)
        self.assertEqual(len(seen), 1)
        self.assertIsNone(rows[2]['result'])
        self.assertEqual(settle_references(rows, fetch, NOW), 0)
