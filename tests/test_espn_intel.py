import unittest
from datetime import datetime, timezone
from scripts.update_espn_intel import expert_picks, normalize, discover, build

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
EVENT = {'id': '123', 'date': '2026-11-09T18:00Z', 'competitions': [{'date': '2026-11-09T18:00Z', 'competitors': [
    {'homeAway': 'away', 'team': {'id': '1', 'name': 'Bengals', 'displayName': 'Cincinnati Bengals', 'abbreviation': 'CIN'}},
    {'homeAway': 'home', 'team': {'id': '2', 'name': 'Falcons', 'displayName': 'Atlanta Falcons', 'abbreviation': 'ATL'}}]}]}
ARTICLE = {'id': 8, 'headline': 'NFL Week 9 preview: Picks', 'published': '2026-11-06T10:00Z', 'byline': 'NFL Nation, Pamela Maldonado, Eric Moody and Seth Walder', 'links': {'web': {'href': 'https://www.espn.com/nfl/story/_/id/8'}}, 'story': '''<h2><a href="https://www.espn.com/nfl/game/_/gameId/123">Bengals at Falcons</a></h2><p>Some analysis.</p><p><strong>Maldonado's pick:</strong> Bengals 30, Falcons 24<br><strong>Moody's pick:</strong> Bengals 30, Falcons 27<br><strong>Walder's pick:</strong> Falcons 23, Bengals 21</p><h2><a href="https://www.espn.com/nfl/game/_/gameId/999">Other game</a></h2><p>Moody's pick: Bengals 99, Falcons 0</p>'''}


class IntelTests(unittest.TestCase):
    def test_exact_section_and_named_authors(self):
        picks = expert_picks(ARTICLE, EVENT, NOW)
        self.assertEqual([p['author'] for p in picks], ['Pamela Maldonado', 'Eric Moody', 'Seth Walder'])
        self.assertEqual([p['winnerId'] for p in picks], ['1', '1', '2'])
        self.assertEqual(picks[2]['scores'], {'2': 23, '1': 21})

    def test_old_premium_and_wrong_game_excluded(self):
        for change in ({'published':'2025-11-06T10:00Z'}, {'premium': True}, {'story':ARTICLE['story'].replace('gameId/123','gameId/1234')}, {'published':'2026-11-10T10:00Z'}):
            self.assertEqual(expert_picks({**ARTICLE, **change}, EVENT, NOW), [])

    def test_related_discovery_without_seeded_article_id(self):
        seed = {**ARTICLE, 'id': 7, 'story': '', 'related': [ARTICLE]}
        found = discover({'articles':[seed]}, NOW, lambda url: {'headlines':[seed if url.endswith('/7') else ARTICLE]})
        self.assertEqual({a['id'] for a in found}, {7,8})

    def test_summary_wrong_identity_rejected(self):
        with self.assertRaises(ValueError):
            normalize(EVENT, {'header':{'id':'999'}}, [], NOW)

    def test_probabilities_and_injuries_validate_ids_dates(self):
        summary = {'header':{**EVENT}, 'predictor':{'homeTeam':{'id':'2','gameProjection':'60'},'awayTeam':{'id':'1','gameProjection':'39.8'}},'injuries':[{'team':{'id':'2'},'injuries':[{'athlete':{'displayName':'Example'},'status':'Out','date':'2020-01-01T00:00Z'}]}]}
        g = normalize(EVENT, summary, [ARTICLE], NOW)
        self.assertEqual(len(g['probabilities']),2)
        self.assertEqual(g['injuries'], [])
        summary['predictor']['homeTeam']['id']='3'
        self.assertEqual(normalize(EVENT,summary,[],NOW)['probabilities'],[])

    def test_failure_does_not_renew_previous_timestamp(self):
        old = {'games':[], 'updatedAt':'2026-11-07T00:00Z'}
        def fail(url): raise OSError('offline')
        result = build(old,NOW,fail)
        self.assertEqual(result['updatedAt'],old['updatedAt'])
        self.assertEqual(result['status'],'unavailable')

    def test_partial_failure_keeps_dated_cache(self):
        cached = {'eventId':'123','startAt':EVENT['date'],'teams':[{'id':'1'},{'id':'2'}], 'checkedAt':'2026-11-06T00:00Z'}
        def fetch(url):
            if url.endswith('scoreboard'):return {'events':[EVENT]}
            if 'news?' in url:return {'articles':[]}
            raise OSError('offline')
        result=build({'games':[cached]},NOW,fetch)
        self.assertEqual(result['games'][0]['checkedAt'],cached['checkedAt'])
        self.assertEqual(result['games'][0]['status'],'unavailable')
