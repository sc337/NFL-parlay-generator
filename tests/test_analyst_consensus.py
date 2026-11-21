import unittest
from datetime import datetime, timezone, timedelta
from scripts.update_analyst_consensus import parse_page, consensus, enrich, ufc_schedule_games

NOW=datetime(2026,11,14,18,tzinfo=timezone.utc)
GAME={'eventId':'g','startAt':'2026-11-15T00:00:00Z','status':'ok','teams':[{'id':'a','name':'Team A'},{'id':'b','name':'Team B'}]}
def page(kind='Spread', selection='A -3.5', author='Analyst One', names=('Team A','Team B'), time='7:00 PM', age='2 hours ago'):
    return f'''<div id="ExpertPicks"><div class="picks-card"><div class="picks-card-header"><img alt="{names[0]} image thumbnail"><img alt="{names[1]} image thumbnail"><span>Sat, Nov 14 • {time} ET</span></div><div data-pick data-pick-teams="Team A" data-pick-types="{kind}" class="pick-cards-expert-component"><div class="fw-bold small">{selection} (-110)</div><a href="/writers/one">{author}</a><span class="badge-style-time-only">Pick made: {age}</span></div></div></div>'''
class AnalystTests(unittest.TestCase):
    def test_exact_identity_time_and_future(self):
        rows=parse_page(page(),'nba',[GAME],NOW)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['line'],-3.5)
        self.assertEqual(rows[0]['selection'],'Team A -3.5')
        for raw in (page(names=('Team A','Other')),page(time='8:00 PM'),page(age='20 days ago')):
            self.assertEqual(parse_page(raw,'nba',[GAME],NOW),[])
        self.assertEqual(parse_page(page(),'nba',[GAME,GAME],NOW),[])
        self.assertEqual(parse_page(page(),'nba',[GAME],NOW+timedelta(days=1)),[])
    def test_specials_do_not_become_full_game_markets(self):
        for kind in ('1st Half Spread','Game Prop','Computer Pick'):
            self.assertEqual(parse_page(page(kind=kind),'nba',[GAME],NOW),[])
        self.assertEqual(parse_page(page().replace('pick-cards-expert-component','computer-picks'),'nba',[GAME],NOW),[])
    def test_player_lines_remain_distinct(self):
        rows=parse_page(page('Points Scored','Player Name o20.5 Points Scored'),'nba',[GAME],NOW)
        self.assertEqual(rows[0]['player'],'Player Name');self.assertEqual(rows[0]['side'],'over')
        self.assertIsNone(rows[0]['publishedAt']);self.assertEqual(rows[0]['publishedLabel'],'2 hours ago')
        self.assertEqual(rows[0]['sourceUrl'],'https://www.covers.com/picks/nba')
    def test_second_source_keeps_attribution_and_exact_game(self):
        raw=page('Total Points, Rebounds, and Assists','Player Name o37.5 Total Points, Rebounds, and Assists').replace('<span class="badge-style-time-only">Pick made: 2 hours ago</span>','')
        rows=parse_page(raw,'nba',[GAME],NOW,source='Sportsbook Review')
        self.assertEqual(len(rows),1)
        self.assertEqual((rows[0]['market'],rows[0]['line'],rows[0]['source']),('pra',37.5,'Sportsbook Review'))
        self.assertEqual(rows[0]['publishedLabel'],'Time not shown')
        self.assertEqual(rows[0]['sourceUrl'],'https://www.sportsbookreview.com/picks/nba/')
        self.assertEqual(parse_page(raw.replace('Team B image thumbnail','Other image thumbnail'),'nba',[GAME],NOW,source='Sportsbook Review'),[])
    def test_second_source_survives_covers_failure(self):
        raw='<link rel="canonical" href="https://www.sportsbookreview.com/picks/nba/">'+page()
        def get(url):
            if 'covers.com' in url:raise OSError('offline')
            return raw.replace('<span class="badge-style-time-only">Pick made: 2 hours ago</span>','')
        result=enrich({'games':[GAME]},'nba',NOW,get)
        self.assertEqual(result['analystCollection']['status'],'ok')
        self.assertEqual(result['analystCollection']['sources']['Covers']['status'],'unavailable')
        self.assertEqual(result['games'][0]['analystConsensus'][0]['picks'][0]['source'],'Sportsbook Review')
    def test_individual_analysts_exact_lines_and_conflicts(self):
        r=parse_page(page(),'nba',[GAME],NOW)[0]
        self.assertEqual(consensus([r,r])[0]['total'],1)
        self.assertEqual(consensus([r,r])[0]['label'],'Single opinion')
        all_rows=[r,{**r,'author':'Two'},{**r,'author':'Three'},{**r,'author':'Four','side':'b','line':3.5,'selection':'Team B +3.5'}]
        self.assertEqual(consensus(all_rows)[0]['label'],'Strong agreement')
        self.assertEqual(consensus(all_rows)[0]['agree'],3)
        self.assertEqual(len(consensus([r,{**r,'line':-4.5}])),2)
        self.assertEqual(consensus([r,{**r,'side':'b','line':3.5}]),[])
        self.assertEqual(consensus([r,all_rows[-1]])[0]['label'],'Split opinions')
    def test_source_failure_clears_old_opinions(self):
        def fail(url):raise OSError('offline')
        result=enrich({'games':[{**GAME,'analystConsensus':[{}]}]},'nba',NOW,fail)
        self.assertEqual(result['games'][0]['analystConsensus'],[])
        self.assertEqual(result['games'][0]['analystCoverage']['status'],'unavailable')
    def test_unrecognized_source_is_not_successful_empty_coverage(self):
        result=enrich({'games':[GAME]},'nba',NOW,lambda url:'<title>Covers error</title>')
        self.assertEqual(result['analystCollection']['status'],'unavailable')
        raw='<link rel="canonical" href="https://www.covers.com/picks/mlb"><div id="ExpertPicks"></div>'
        result=enrich({'games':[]},'mlb',NOW,lambda url:raw)
        self.assertEqual(result['analystCollection']['status'],'ok')
        self.assertEqual(result['analystCollection']['picks'],0)
    def test_ufc_schedule_requires_fresh_explicit_pregame_evidence(self):
        row={'source':'ESPN','game_status':'pre','game_time':GAME['startAt'],'espn_game_id':'1','fighter1':'Team A','fighter2':'Team B'}
        snap={'slate':{'updated_at':NOW.isoformat(),'games':[row]}}
        self.assertEqual(len(ufc_schedule_games(snap,NOW)),1)
        self.assertEqual(ufc_schedule_games(snap,NOW+timedelta(hours=3)),[])
        snap['slate']['games']=[{**row,'game_status':'in'}]
        self.assertEqual(ufc_schedule_games(snap,NOW),[])
    def test_ufc_requires_unique_exact_pair_and_date(self):
        raw=page('Fight Winner','Team A').replace('<img alt="Team A image thumbnail"><img alt="Team B image thumbnail">','<h3>Team A vs Team B</h3>').replace('7:00 PM ET','Venue')
        rows=parse_page(raw,'ufc',[GAME],NOW)
        self.assertEqual(rows[0]['market'],'moneyline')
        self.assertEqual(parse_page(raw,'ufc',[GAME,GAME],NOW),[])
if __name__=='__main__':unittest.main()
