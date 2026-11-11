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
            if 'scoreboard?' in url:return {'events':[EVENT]}
            if 'news?' in url:return {'articles':[]}
            raise OSError('offline')
        result=build({'games':[cached]},NOW,fetch)
        self.assertEqual(result['games'][0]['checkedAt'],cached['checkedAt'])
        self.assertEqual(result['games'][0]['status'],'unavailable')

    def test_other_sports_use_correct_endpoint_and_statistics(self):
        from scripts.update_espn_intel import SPORTS, METRICS
        for sport in ('nba','nhl','mlb','ncaaf'):
            calls=[]
            metric=METRICS[sport][0]
            def fetch(url):
                calls.append(url)
                if 'scoreboard?' in url: return {'events':[EVENT]}
                if 'news?' in url: return {'articles':[]}
                return {'header':EVENT,'boxscore':{'teams':[{'team':{'id':'1'},'statistics':[{'name':metric,'displayValue':'12.3'},{'name':'unknown','displayValue':'999'}]}]}}
            result=build({'games':[]},NOW,fetch,sport)
            self.assertEqual(len(result['games']),1)
            self.assertEqual(result['games'][0]['sport'],sport)
            self.assertEqual(result['games'][0]['statistics'][0]['values'],{metric:'12.3'})
            self.assertTrue(all(SPORTS[sport] in url for url in calls))
            self.assertTrue(any('dates=20261109' in url for url in calls))

    def test_ufc_keeps_each_bout_separate(self):
        from scripts.update_espn_intel import normalize_fights
        def bout(id, names):
            return {'id':id,'competitors':[{'athlete':{'id':str(i),'displayName':n}} for i,n in enumerate(names)]}
        event={'id':'card','name':'UFC card','date':EVENT['date'],'competitions':[bout('1',['A','B']),bout('2',['C','D'])]}
        rows=normalize_fights(event,NOW)
        self.assertEqual([r['eventId'] for r in rows],['card:1','card:2'])
        self.assertEqual(rows[1]['teams'][0]['name'],'C')
        self.assertEqual(rows[0]['probabilities'],[])
        self.assertEqual(normalize_fights({**event,'date':'2026-11-01T00:00Z'},NOW),[])

    def test_preview_story_evidence_is_short_attributed_and_not_a_prediction(self):
        article = {**ARTICLE, 'gameId':'123', 'story':'J.J. Example is set to play despite a hip injury.\n\n“We must win,” said Example.'}
        g = normalize(EVENT, {'header':EVENT,'article':article}, [], NOW)
        self.assertEqual(g['evidence'][0]['kind'], 'Preview report')
        self.assertEqual(g['evidence'][0]['text'], 'J.J. Example is set to play despite a hip injury.')
        self.assertLessEqual(len(g['evidence'][0]['text'].split()),24)
        for changes in ({'premium':True},{'gameId':'999'},{'published':'2020-01-01T00:00Z'},{'published':EVENT['date']}):
            self.assertEqual(normalize(EVENT,{'header':EVENT,'article':{**article,**changes}},[],NOW)['evidence'],[])

    def test_preview_hydration_does_not_cross_game_or_fail_matchup(self):
        from scripts.update_espn_intel import hydrate_preview
        article={**ARTICLE,'gameId':'123','story':''}
        summary={'header':EVENT,'article':article}
        for full in ({**article,'gameId':'999','story':'Wrong game'}, {**article,'premium':True,'story':'Paid content'}):
            self.assertEqual(hydrate_preview(summary,EVENT,NOW,lambda url:{'headlines':[full]}),summary)
        def fail(url): raise OSError('offline')
        self.assertEqual(hydrate_preview(summary,EVENT,NOW,fail),summary)
        hydrated=hydrate_preview(summary,EVENT,NOW,lambda url:{'headlines':[{**article,'story':'Full story'}]})
        self.assertEqual(hydrated['article']['story'],'Full story')

    def test_leaders_and_matchup_statistics_are_bound_to_teams(self):
        summary={'header':EVENT,'leaders':[{'team':{'id':'999'},'leaders':[{'displayName':'Passing','leaders':[{'athlete':{'displayName':'Wrong'},'displayValue':'999'}]}]}],
                 'boxscore':{'teams':[{'team':{'id':'1'},'statistics':[{'name':'passingYardsPerGame','displayValue':'250'}]},{'team':{'id':'2'},'statistics':[{'name':'passingYardsPerGameAllowed','displayValue':'280'}]}]}}
        g=normalize(EVENT,summary,[],NOW)
        self.assertEqual(g['leaders'],[])
        self.assertEqual(g['evidence'][0]['kind'],'Season statistics')
        self.assertIn('250',g['evidence'][0]['text'])
        self.assertIn('280',g['evidence'][0]['text'])

    def test_preview_playing_claim_does_not_override_injury_report(self):
        article={**ARTICLE,'gameId':'123','story':'Example is set to play on Sunday.'}
        summary={'header':EVENT,'article':article,'injuries':[{'team':{'id':'1'},'injuries':[{'athlete':{'displayName':'John Example','position':{'abbreviation':'QB'}},'status':'Questionable','date':'2026-11-07T12:00Z'}]}]}
        g=normalize(EVENT,summary,[],NOW)
        self.assertEqual(g['evidence'][0]['text'],'John Example — Questionable')
        self.assertIn('Availability unconfirmed',g['evidence'][1]['caveat'])

    def test_recent_results_exclude_future_and_wrong_team(self):
        from scripts.update_espn_intel import recent_results
        row={'gameDate':'2026-11-01T18:00Z','homeTeamId':'1','awayTeamId':'9','gameResult':'W','score':'20-10','opponent':{'abbreviation':'OPP'}}
        summary={'lastFiveGames':[{'team':{'id':'1'},'events':[row,{**row,'gameDate':EVENT['date']},{**row,'homeTeamId':'8'}]}]}
        self.assertEqual(recent_results(summary,{'1','2'},NOW),[{'teamId':'1','games':[{'date':row['gameDate'],'result':'W','score':'20-10','opponent':'OPP'}]}])
